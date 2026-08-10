'use strict';

const { query } = require('../db/pool');
const { calculateMonthlySalary } = require('../services/salaryService');
const { generatePayslipPDF, generateConsolidatedExcel } = require('../services/reportService');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/salary/compute
// Previews deterministic monthly salary calculation
// ─────────────────────────────────────────────────────────────────────────────
async function computeSalary(req, res, next) {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const year = parseInt(req.query.year, 10) || currentYear;
    const month = parseInt(req.query.month, 10) || currentMonth;

    if (month < 1 || month > 12) {
      return res.status(400).json({ message: 'Month must be between 1 and 12.' });
    }

    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id, 10);
    } else if (req.user.role !== 'admin' && req.query.user_id) {
      if (parseInt(req.query.user_id, 10) !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your own salary computation.' });
      }
    }

    const result = await calculateMonthlySalary({ query }, targetUserId, year, month);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reports/payslips/generate
// Admin generates / snapshots a monthly payslip record
// ─────────────────────────────────────────────────────────────────────────────
async function generatePayslip(req, res, next) {
  try {
    const { user_id, year, month } = req.body;

    if (!user_id || !year || !month) {
      return res.status(400).json({ message: 'user_id, year, and month are required.' });
    }

    const calc = await calculateMonthlySalary({ query }, user_id, parseInt(year, 10), parseInt(month, 10));

    const { rows } = await query(
      `INSERT INTO payslips
         (user_id, month, year, working_days, present_days, half_days, travel_days,
          paid_leave_days, unpaid_leave_days, absent_days, holiday_count, weekend_count,
          per_day_salary, net_salary, breakdown, generated_by, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
       ON CONFLICT (user_id, month, year) DO UPDATE
       SET
         working_days      = EXCLUDED.working_days,
         present_days      = EXCLUDED.present_days,
         half_days         = EXCLUDED.half_days,
         travel_days       = EXCLUDED.travel_days,
         paid_leave_days   = EXCLUDED.paid_leave_days,
         unpaid_leave_days = EXCLUDED.unpaid_leave_days,
         absent_days       = EXCLUDED.absent_days,
         holiday_count     = EXCLUDED.holiday_count,
         weekend_count     = EXCLUDED.weekend_count,
         per_day_salary    = EXCLUDED.per_day_salary,
         net_salary        = EXCLUDED.net_salary,
         breakdown         = EXCLUDED.breakdown,
         generated_by      = EXCLUDED.generated_by,
         generated_at      = NOW(),
         updated_at        = NOW()
       RETURNING *`,
      [
        user_id,
        parseInt(month, 10),
        parseInt(year, 10),
        calc.summary.working_days,
        calc.summary.present_days,
        calc.summary.half_days,
        calc.summary.travel_days,
        calc.summary.paid_leave_days,
        calc.summary.unpaid_leave_days,
        calc.summary.absent_days,
        calc.summary.holiday_count,
        calc.summary.weekend_count,
        calc.summary.per_day_salary,
        calc.summary.net_salary,
        JSON.stringify(calc.days),
        req.user.id,
      ]
    );

    return res.status(201).json({
      message: 'Payslip generated and saved successfully.',
      payslip: rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/payslips
// Lists available payslips (Employee sees own, Admin sees all)
// ─────────────────────────────────────────────────────────────────────────────
async function listPayslips(req, res, next) {
  try {
    const conditions = [];
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      conditions.push(`p.user_id = $${params.length}`);
    } else if (req.query.user_id) {
      params.push(parseInt(req.query.user_id, 10));
      conditions.push(`p.user_id = $${params.length}`);
    }

    if (req.query.year) {
      params.push(parseInt(req.query.year, 10));
      conditions.push(`p.year = $${params.length}`);
    }

    if (req.query.month) {
      params.push(parseInt(req.query.month, 10));
      conditions.push(`p.month = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT p.id, p.user_id, p.month, p.year, p.working_days, p.present_days,
              p.half_days, p.travel_days, p.paid_leave_days, p.unpaid_leave_days,
              p.absent_days, p.holiday_count, p.weekend_count, p.per_day_salary,
              p.net_salary, p.generated_at,
              u.name AS employee_name, u.employee_id, u.designation,
              g.name AS generated_by_name
       FROM payslips p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN users g ON g.id = p.generated_by
       ${whereClause}
       ORDER BY p.year DESC, p.month DESC, u.name ASC`,
      params
    );

    return res.status(200).json({ payslips: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/payslips/:id
// Fetches detailed immutable snapshot of a single payslip
// ─────────────────────────────────────────────────────────────────────────────
async function getPayslipById(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT p.*,
              u.name AS employee_name, u.employee_id, u.designation, u.email,
              g.name AS generated_by_name
       FROM payslips p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN users g ON g.id = p.generated_by
       WHERE p.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Payslip not found.' });
    }

    const payslip = rows[0];
    if (req.user.role !== 'admin' && payslip.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view your own payslips.' });
    }

    return res.status(200).json({ payslip });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/payslips/:id/download
// Downloads a payslip as PDF
// ─────────────────────────────────────────────────────────────────────────────
async function downloadPayslipPDF(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT p.*,
              u.name AS employee_name, u.employee_id, u.designation, u.email
       FROM payslips p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Payslip not found.' });
    }

    const payslip = rows[0];
    if (req.user.role !== 'admin' && payslip.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only download your own payslips.' });
    }

    const formattedData = {
      employee: {
        name: payslip.employee_name,
        employee_id: payslip.employee_id,
        designation: payslip.designation,
      },
      year: payslip.year,
      month: payslip.month,
      summary: {
        working_days: payslip.working_days,
        present_days: payslip.present_days,
        half_days: payslip.half_days,
        travel_days: payslip.travel_days,
        paid_leave_days: payslip.paid_leave_days,
        unpaid_leave_days: payslip.unpaid_leave_days,
        absent_days: payslip.absent_days,
        holiday_count: payslip.holiday_count,
        weekend_count: payslip.weekend_count,
        per_day_salary: payslip.per_day_salary,
        net_salary: payslip.net_salary,
      },
      days: Array.isArray(payslip.breakdown) ? payslip.breakdown : JSON.parse(payslip.breakdown || '[]'),
    };

    const pdfBuffer = await generatePayslipPDF(formattedData);
    const monthName = MONTH_NAMES[payslip.month - 1] || `Month_${payslip.month}`;
    const filename = `Payslip_${payslip.employee_id}_${monthName}_${payslip.year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/consolidated/excel
// Admin downloads monthly consolidated Excel report
// ─────────────────────────────────────────────────────────────────────────────
async function downloadConsolidatedExcel(req, res, next) {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const year = parseInt(req.query.year, 10) || currentYear;
    const month = parseInt(req.query.month, 10) || currentMonth;

    if (month < 1 || month > 12) {
      return res.status(400).json({ message: 'Month must be between 1 and 12.' });
    }

    // Fetch all active employees
    const { rows: employees } = await query(
      `SELECT id, employee_id, name, designation, email, per_day_salary
       FROM users
       WHERE role = 'employee' AND status = 'active'
       ORDER BY name ASC`
    );

    const reportData = [];
    for (const emp of employees) {
      const calc = await calculateMonthlySalary({ query }, emp.id, year, month);
      reportData.push(calc);
    }

    const excelBuffer = await generateConsolidatedExcel(reportData, year, month);
    const monthName = MONTH_NAMES[month - 1] || `Month_${month}`;
    const filename = `Consolidated_Payroll_${monthName}_${year}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(excelBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  computeSalary,
  generatePayslip,
  listPayslips,
  getPayslipById,
  downloadPayslipPDF,
  downloadConsolidatedExcel,
};
