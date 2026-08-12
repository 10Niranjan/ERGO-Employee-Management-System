'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getLeaveBalances,
  applyLeave,
  getLeaveApplications,
  reviewLeaveApplication,
  getLeaveLedger,
  getAccrualRuns,
  runAccrualManually,
} = require('../controllers/leaveController');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// All leave routes require authentication
router.use(authenticate);

// ─── Leave Balances ──────────────────────────────────────────────────────────
// GET /api/leaves/balances
router.get(
  '/balances',
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  getLeaveBalances
);

// ─── Leave Applications ──────────────────────────────────────────────────────
// POST /api/leaves — Apply for leave
router.post(
  '/',
  [
    body('leave_type_id').isInt({ min: 1 }).withMessage('Leave type ID must be a positive integer.'),
    body('start_date').isISO8601().withMessage('Start date must be in YYYY-MM-DD format.'),
    body('end_date').isISO8601().withMessage('End date must be in YYYY-MM-DD format.'),
    body('reason').trim().notEmpty().withMessage('Reason for leave is required.'),
  ],
  validate,
  applyLeave
);

// GET /api/leaves — List leave applications (Role-aware)
router.get(
  '/',
  [
    qv('status').optional().isIn(['pending', 'approved', 'declined', 'all']).withMessage('Invalid status filter.'),
    qv('leave_type_id').optional().isInt({ min: 1 }).withMessage('Invalid leave_type_id.'),
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  getLeaveApplications
);

// PUT /api/leaves/:id/status — Admin Approve or Decline
router.put(
  '/:id/status',
  authorizeAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid leave application ID.'),
    body('status').isIn(['approved', 'declined']).withMessage("Status must be 'approved' or 'declined'."),
    body('decline_reason').optional({ nullable: true }).trim(),
    body('admin_notes').optional({ nullable: true }).trim(),
  ],
  validate,
  reviewLeaveApplication
);

// ─── Attendance-Based Accrual: Ledger & History ──────────────────────────────
// GET /api/leaves/ledger — full transaction history behind a balance
router.get(
  '/ledger',
  [
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
  ],
  validate,
  getLeaveLedger
);

// GET /api/leaves/accrual/runs — month-by-month attendance-bonus evaluation history
router.get(
  '/accrual/runs',
  [qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.')],
  validate,
  getAccrualRuns
);

// POST /api/leaves/accrual/run — Admin only — manual trigger / backfill
router.post(
  '/accrual/run',
  authorizeAdmin,
  [
    body('period').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('Period must be in YYYY-MM format.'),
    body('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  runAccrualManually
);

module.exports = router;
