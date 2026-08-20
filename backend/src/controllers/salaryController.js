'use strict';

const { query, getClient } = require('../db/pool');
const { buildComponentSnapshot } = require('../services/salaryService');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/salary
// Admin only — list all employees with their monthly salary, derived per-day
// rate, and all salary component breakdown fields.
// ─────────────────────────────────────────────────────────────────────────────
async function getSalaryRates(req, res, next) {
  try {
    const search = (req.query.search || '').trim();
    const params = [];
    let whereClause = "WHERE role = 'employee'";

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (name ILIKE $1 OR employee_id ILIKE $1 OR designation ILIKE $1)`;
    }

    const { rows } = await query(
      `SELECT id, employee_id, name, designation, email, status, updated_at,
              monthly_salary,
              basic, hra, education_allowance, conveyance, professional_development,
              other_allowance, lta, employer_pf, bonus,
              pf_deduction, professional_tax, tds, pan
       FROM users
       ${whereClause}
       ORDER BY name ASC`,
      params
    );

    const now = new Date();
    const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const employees = rows.map((emp) => ({
      ...emp,
      derived_per_day_rate: daysInCurrentMonth > 0
        ? Math.round((parseFloat(emp.monthly_salary) / daysInCurrentMonth) * 100) / 100
        : 0,
    }));

    return res.status(200).json({ employees });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/salary/:userId
// Admin only — update a single employee's monthly salary AND component fields.
// Logs the revision + full component snapshot to salary_history.
// ─────────────────────────────────────────────────────────────────────────────
async function updateSalaryRate(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { userId } = req.params;
    const {
      monthly_salary, note,
      basic, hra, education_allowance, conveyance, professional_development,
      other_allowance, lta, employer_pf, bonus,
      pf_deduction, professional_tax, tds, pan,
    } = req.body;
    const adminId = req.user.id;

    const newSalary = parseFloat(monthly_salary);
    if (isNaN(newSalary) || newSalary < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Monthly salary must be a non-negative number.' });
    }

    // Fetch current salary + components for audit
    const { rows: empRows } = await client.query(
      `SELECT id, employee_id, name, monthly_salary,
              basic, hra, education_allowance, conveyance, professional_development,
              other_allowance, lta, employer_pf, bonus,
              pf_deduction, professional_tax, tds, pan
       FROM users
       WHERE id = $1 AND role = 'employee'`,
      [userId]
    );

    if (!empRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const oldSalary = parseFloat(empRows[0].monthly_salary);
    const oldSnapshot = buildComponentSnapshot(empRows[0]);

    // Update user: monthly_salary + all 13 component fields
    const { rows: updatedRows } = await client.query(
      `UPDATE users
       SET monthly_salary           = $1,
           basic                    = COALESCE($2, basic),
           hra                      = COALESCE($3, hra),
           education_allowance      = COALESCE($4, education_allowance),
           conveyance               = COALESCE($5, conveyance),
           professional_development = COALESCE($6, professional_development),
           other_allowance          = COALESCE($7, other_allowance),
           lta                      = COALESCE($8, lta),
           employer_pf              = COALESCE($9, employer_pf),
           bonus                    = COALESCE($10, bonus),
           pf_deduction             = COALESCE($11, pf_deduction),
           professional_tax         = COALESCE($12, professional_tax),
           tds                      = COALESCE($13, tds),
           pan                      = COALESCE(UPPER($14), pan),
           updated_at               = NOW()
       WHERE id = $15
       RETURNING id, employee_id, name, designation, email, monthly_salary, status,
                 basic, hra, education_allowance, conveyance, professional_development,
                 other_allowance, lta, employer_pf, bonus,
                 pf_deduction, professional_tax, tds, pan`,
      [
        newSalary,
        basic       !== undefined ? parseFloat(basic)        : null,
        hra         !== undefined ? parseFloat(hra)          : null,
        education_allowance      !== undefined ? parseFloat(education_allowance)      : null,
        conveyance               !== undefined ? parseFloat(conveyance)               : null,
        professional_development !== undefined ? parseFloat(professional_development) : null,
        other_allowance          !== undefined ? parseFloat(other_allowance)          : null,
        lta                      !== undefined ? parseFloat(lta)                      : null,
        employer_pf              !== undefined ? parseFloat(employer_pf)              : null,
        bonus                    !== undefined ? parseFloat(bonus)                    : null,
        pf_deduction             !== undefined ? parseFloat(pf_deduction)             : null,
        professional_tax         !== undefined ? parseFloat(professional_tax)         : null,
        tds                      !== undefined ? parseFloat(tds)                      : null,
        pan?.trim() || null,
        userId,
      ]
    );

    const newSnapshot = buildComponentSnapshot(updatedRows[0]);

    // Record revision in salary_history with full component snapshots
    const { rows: historyRows } = await client.query(
      `INSERT INTO salary_history
         (user_id, old_monthly_salary, new_monthly_salary, changed_by, note, components_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, old_monthly_salary, new_monthly_salary, changed_by, note, changed_at, components_snapshot`,
      [
        userId,
        oldSalary,
        newSalary,
        adminId,
        note?.trim() || null,
        JSON.stringify({ before: oldSnapshot, after: newSnapshot }),
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      employee: updatedRows[0],
      revision: historyRows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/salary/history
// Admin only — full salary revision history across all employees
// ─────────────────────────────────────────────────────────────────────────────
async function getSalaryHistory(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const offset = (page - 1) * limit;

    const countResult = await query(
      'SELECT COUNT(*) AS total FROM salary_history WHERE new_monthly_salary IS NOT NULL'
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows } = await query(
      `SELECT
         sh.id, sh.old_monthly_salary, sh.new_monthly_salary, sh.note, sh.changed_at,
         sh.components_snapshot,
         u.employee_id, u.name AS employee_name, u.designation,
         a.name AS changed_by_name, a.employee_id AS changed_by_employee_id
       FROM salary_history sh
       JOIN users u ON u.id = sh.user_id
       JOIN users a ON a.id = sh.changed_by
       WHERE sh.new_monthly_salary IS NOT NULL
       ORDER BY sh.changed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({
      history: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/salary/:userId/history
// Admin only — revision history for one specific employee
// ─────────────────────────────────────────────────────────────────────────────
async function getEmployeeSalaryHistory(req, res, next) {
  try {
    const { userId } = req.params;

    const { rows: empCheck } = await query(
      "SELECT id, name, employee_id FROM users WHERE id = $1 AND role = 'employee'",
      [userId]
    );
    if (!empCheck.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const { rows } = await query(
      `SELECT
         sh.id, sh.old_monthly_salary, sh.new_monthly_salary, sh.note, sh.changed_at,
         sh.components_snapshot,
         a.name AS changed_by_name, a.employee_id AS changed_by_employee_id
       FROM salary_history sh
       JOIN users a ON a.id = sh.changed_by
       WHERE sh.user_id = $1 AND sh.new_monthly_salary IS NOT NULL
       ORDER BY sh.changed_at DESC`,
      [userId]
    );

    return res.status(200).json({
      employee: empCheck[0],
      history: rows,
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/salary/my
// Employee (or admin) — returns the calling user's own salary components ONLY.
// Hard-scoped to req.user.id — cannot leak another employee's data.
// ─────────────────────────────────────────────────────────────────────────────
async function getMySalaryComponents(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT monthly_salary,
              basic, hra, education_allowance, conveyance, professional_development,
              other_allowance, lta, employer_pf, bonus,
              pf_deduction, professional_tax, tds, pan
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const emp = rows[0];
    const gross = [
      emp.basic, emp.hra, emp.education_allowance, emp.conveyance,
      emp.professional_development, emp.other_allowance, emp.lta,
      emp.employer_pf, emp.bonus,
    ].reduce((sum, v) => sum + parseFloat(v || 0), 0);

    const totalDeduction = [emp.pf_deduction, emp.professional_tax, emp.tds]
      .reduce((sum, v) => sum + parseFloat(v || 0), 0);

    return res.status(200).json({
      components: {
        ...buildComponentSnapshot(emp),
        gross_income:    Math.round(gross * 100) / 100,
        total_deduction: Math.round(totalDeduction * 100) / 100,
        net_salary:      Math.round((gross - totalDeduction) * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSalaryRates,
  updateSalaryRate,
  getSalaryHistory,
  getEmployeeSalaryHistory,
  getMySalaryComponents,
};
