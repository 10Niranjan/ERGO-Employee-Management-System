'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  markAttendance,
  getTodayAttendance,
  getMonthlyAttendance,
  getTeamAttendance,
  requestCorrection,
  getCorrections,
  reviewCorrection,
  overrideAttendance,
} = require('../controllers/attendanceController');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// All attendance routes require authentication
router.use(authenticate);

// ─── Employee + Shared routes ────────────────────────────────────────────────
// POST /api/attendance — Mark today's attendance
router.post(
  '/',
  [
    body('status')
      .trim()
      .isIn(['present', 'half_day', 'travel'])
      .withMessage("Status must be 'present', 'half_day', or 'travel'."),
  ],
  validate,
  markAttendance
);

// GET /api/attendance/today — Today's attendance info & prompt status
router.get('/today', getTodayAttendance);

// GET /api/attendance/monthly — Monthly attendance calendar
router.get(
  '/monthly',
  [
    qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100.'),
    qv('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12.'),
    qv('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
  ],
  validate,
  getMonthlyAttendance
);

// POST /api/attendance/:id/correction — Employee requests correction on their record
router.post(
  '/:id/correction',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid attendance ID.'),
    body('requested_status')
      .trim()
      .isIn(['present', 'half_day', 'travel', 'absent'])
      .withMessage("Requested status must be 'present', 'half_day', 'travel', or 'absent'."),
    body('reason').trim().notEmpty().withMessage('Reason for correction is required.'),
  ],
  validate,
  requestCorrection
);

// ─── Admin-only routes ───────────────────────────────────────────────────────
// GET /api/attendance/team — Team attendance for selected date
router.get(
  '/team',
  authorizeAdmin,
  [
    qv('date').optional().isISO8601().withMessage('Date must be in YYYY-MM-DD format.'),
  ],
  validate,
  getTeamAttendance
);

// GET /api/attendance/corrections — List all correction requests
router.get(
  '/corrections',
  authorizeAdmin,
  [
    qv('status').optional().isIn(['pending', 'approved', 'declined', 'all']).withMessage('Invalid status filter.'),
  ],
  validate,
  getCorrections
);

// PUT /api/attendance/:id/correction/review — Approve or decline correction request
router.put(
  '/:id/correction/review',
  authorizeAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid attendance ID.'),
    body('action').isIn(['approve', 'decline']).withMessage("Action must be 'approve' or 'decline'."),
    body('decline_reason').optional({ nullable: true }).trim(),
  ],
  validate,
  reviewCorrection
);

// PUT /api/attendance/:id/override — Admin manual override
router.put(
  '/:id/override',
  authorizeAdmin,
  [
    body('status')
      .trim()
      .isIn(['present', 'half_day', 'travel', 'absent'])
      .withMessage("Status must be 'present', 'half_day', 'travel', or 'absent'."),
    body('reason').trim().notEmpty().withMessage('Override reason is required.'),
    body('user_id').optional().isInt({ min: 1 }).withMessage('Invalid user_id.'),
    body('date').optional().isISO8601().withMessage('Date must be in YYYY-MM-DD format.'),
  ],
  validate,
  overrideAttendance
);

module.exports = router;
