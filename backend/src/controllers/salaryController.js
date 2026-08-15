'use strict';

const { query, getClient } = require('../db/pool');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/salary
// Admin only — list all employees with their current per-day salary
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
      `SELECT id, employee_id, name, designation, email, per_day_salary, status, updated_at
       FROM users
       ${whereClause}
       ORDER BY name ASC`,
      params
    );

    return res.status(200).json({ employees: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/salary/:userId
// Admin only — update a single employee's per-day salary and log the change
// ─────────────────────────────────────────────────────────────────────────────
async function updateSalaryRate(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { userId } = req.params;
    const { per_day_salary, note } = req.body;
    const adminId = req.user.id;

    const newRate = parseFloat(per_day_salary);
    if (isNaN(newRate) || newRate < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Per-day salary must be a non-negative number.' });
    }

    // Fetch current salary
    const { rows: empRows } = await client.query(
      `SELECT id, employee_id, name, per_day_salary
       FROM users
       WHERE id = $1 AND role = 'employee'`,
      [userId]
    );

    if (!empRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const oldRate = parseFloat(empRows[0].per_day_salary);

    // Update user's per-day salary
    const { rows: updatedRows } = await client.query(
      `UPDATE users
       SET per_day_salary = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, employee_id, name, designation, email, per_day_salary, status`,
      [newRate, userId]
    );

    // Record the revision in salary_history (always, even if same rate — for audit trail)
    const { rows: historyRows } = await client.query(
      `INSERT INTO salary_history (user_id, old_rate, new_rate, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, old_rate, new_rate, changed_by, note, changed_at`,
      [userId, oldRate, newRate, adminId, note?.trim() || null]
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

    const countResult = await query('SELECT COUNT(*) AS total FROM salary_history');
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows } = await query(
      `SELECT
         sh.id, sh.old_rate, sh.new_rate, sh.note, sh.changed_at,
         u.employee_id, u.name AS employee_name, u.designation,
         a.name AS changed_by_name, a.employee_id AS changed_by_employee_id
       FROM salary_history sh
       JOIN users u ON u.id = sh.user_id
       JOIN users a ON a.id = sh.changed_by
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

    // Verify employee exists
    const { rows: empCheck } = await query(
      "SELECT id, name, employee_id FROM users WHERE id = $1 AND role = 'employee'",
      [userId]
    );
    if (!empCheck.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const { rows } = await query(
      `SELECT
         sh.id, sh.old_rate, sh.new_rate, sh.note, sh.changed_at,
         a.name AS changed_by_name, a.employee_id AS changed_by_employee_id
       FROM salary_history sh
       JOIN users a ON a.id = sh.changed_by
       WHERE sh.user_id = $1
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

module.exports = {
  getSalaryRates,
  updateSalaryRate,
  getSalaryHistory,
  getEmployeeSalaryHistory,
};
