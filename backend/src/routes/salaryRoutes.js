'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getSalaryRates, updateSalaryRate, getSalaryHistory,
  getEmployeeSalaryHistory, getMySalaryComponents,
} = require('../controllers/salaryController');

const router = Router();

// All routes require authentication at minimum
router.use(authenticate);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// Reusable salary component body validators
const salaryComponentValidators = [
  body('basic').optional().isFloat({ min: 0 }).withMessage('Basic must be a non-negative number.'),
  body('hra').optional().isFloat({ min: 0 }).withMessage('HRA must be a non-negative number.'),
  body('education_allowance').optional().isFloat({ min: 0 }).withMessage('Education allowance must be a non-negative number.'),
  body('conveyance').optional().isFloat({ min: 0 }).withMessage('Conveyance must be a non-negative number.'),
  body('professional_development').optional().isFloat({ min: 0 }).withMessage('Professional development must be a non-negative number.'),
  body('other_allowance').optional().isFloat({ min: 0 }).withMessage('Other allowance must be a non-negative number.'),
  body('lta').optional().isFloat({ min: 0 }).withMessage('LTA must be a non-negative number.'),
  body('employer_pf').optional().isFloat({ min: 0 }).withMessage('Employer PF must be a non-negative number.'),
  body('bonus').optional().isFloat({ min: 0 }).withMessage('Bonus must be a non-negative number.'),
  body('pf_deduction').optional().isFloat({ min: 0 }).withMessage('PF deduction must be a non-negative number.'),
  body('professional_tax').optional().isFloat({ min: 0 }).withMessage('Professional tax must be a non-negative number.'),
  body('tds').optional().isFloat({ min: 0 }).withMessage('TDS must be a non-negative number.'),
  body('pan').optional({ nullable: true, checkFalsy: true }).trim()
    .matches(/^[A-Z0-9]{10}$/i).withMessage('PAN must be 10 alphanumeric characters.'),
];

// ─── Employee-facing: own salary components only ──────────────────────────────
// GET /api/salary/my
// authenticate only — no admin guard. Hard-scoped to req.user.id in controller.
// MUST be declared before /:userId to avoid route-matching collision.
router.get('/my', getMySalaryComponents);

// ─── Admin-only routes below ──────────────────────────────────────────────────
// GET /api/salary — list all employees with salary rates
router.get('/', authorizeAdmin, getSalaryRates);

// GET /api/salary/history — global revision history (must come before /:userId)
router.get(
  '/history',
  authorizeAdmin,
  [
    qv('page').optional().isInt({ min: 1 }).withMessage('Invalid page number.'),
    qv('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100.'),
  ],
  validate,
  getSalaryHistory
);

// PUT /api/salary/:userId — update a single employee's salary + components
router.put(
  '/:userId',
  authorizeAdmin,
  [
    param('userId').isInt({ min: 1 }).withMessage('Invalid user ID.'),
    body('monthly_salary')
      .notEmpty().withMessage('Monthly salary is required.')
      .isFloat({ min: 0 }).withMessage('Monthly salary must be a non-negative number.'),
    body('note').optional({ nullable: true }).trim(),
    ...salaryComponentValidators,
  ],
  validate,
  updateSalaryRate
);

// GET /api/salary/:userId/history — per-employee revision history
router.get(
  '/:userId/history',
  authorizeAdmin,
  [param('userId').isInt({ min: 1 }).withMessage('Invalid user ID.')],
  validate,
  getEmployeeSalaryHistory
);

module.exports = router;
