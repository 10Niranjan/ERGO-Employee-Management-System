'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
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

// PDF/Excel generation is the most CPU/memory-expensive work in the app and,
// unlike auth, had no rate limit — any single authenticated account could
// hammer it to degrade service for everyone. Generous per-user budget since
// this guards against abuse, not normal use.
const skipInTests = () => process.env.NODE_ENV === 'test';
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: 'Too many report requests. Please try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});

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
  downloadLimiter,
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
  downloadLimiter,
  [param('id').isInt({ min: 1 }).withMessage('Invalid payslip ID.')],
  validate,
  downloadPayslipPDF
);

// ─── Admin Consolidated Payroll Report ───────────────────────────────────────
// GET /api/reports/consolidated/excel (Admin only)
router.get(
  '/consolidated/excel',
  authorizeAdmin,
  downloadLimiter,
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month.'),
  ],
  validate,
  downloadConsolidatedExcel
);

module.exports = router;
