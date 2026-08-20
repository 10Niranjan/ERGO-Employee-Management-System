'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  computeSalary,
  downloadLiveSalaryPDF,
  generatePayslip,
  listPayslips,
  getPayslipById,
  downloadPayslipPDF,
  downloadConsolidatedExcel,
} = require('../controllers/reportController');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// All report and salary routes require authentication
router.use(authenticate);

// ─── Salary Computation ──────────────────────────────────────────────────────
// GET /api/reports/salary/compute
router.get(
  '/salary/compute',
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  computeSalary
);

// GET /api/reports/salary/compute/download (live/provisional PDF)
router.get(
  '/salary/compute/download',
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  downloadLiveSalaryPDF
);

// ─── Payslips ────────────────────────────────────────────────────────────────
// POST /api/reports/payslips/generate (Admin only)
router.post(
  '/payslips/generate',
  authorizeAdmin,
  [
    body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer.'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100.'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12.'),
  ],
  validate,
  generatePayslip
);

// GET /api/reports/payslips (List)
router.get(
  '/payslips',
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  listPayslips
);

// GET /api/reports/payslips/:id (View single)
router.get(
  '/payslips/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid payslip ID.')],
  validate,
  getPayslipById
);

// GET /api/reports/payslips/:id/download (PDF download)
router.get(
  '/payslips/:id/download',
  [param('id').isInt({ min: 1 }).withMessage('Invalid payslip ID.')],
  validate,
  downloadPayslipPDF
);

// ─── Admin Consolidated Payroll Report ───────────────────────────────────────
// GET /api/reports/consolidated/excel (Admin only)
router.get(
  '/consolidated/excel',
  authorizeAdmin,
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month.'),
  ],
  validate,
  downloadConsolidatedExcel
);

module.exports = router;
