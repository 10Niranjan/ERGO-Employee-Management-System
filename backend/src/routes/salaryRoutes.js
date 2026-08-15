'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getSalaryRates, updateSalaryRate, getSalaryHistory, getEmployeeSalaryHistory,
} = require('../controllers/salaryController');

const router = Router();

// All salary routes are admin only
router.use(authenticate, authorizeAdmin);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// GET /api/salary — list all employees with salary rates
router.get('/', getSalaryRates);

// GET /api/salary/history — global revision history (must come before /:userId)
router.get(
  '/history',
  [
    qv('page').optional().isInt({ min: 1 }).withMessage('Invalid page number.'),
    qv('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100.'),
  ],
  validate,
  getSalaryHistory
);

// PUT /api/salary/:userId — update a single employee's monthly salary
router.put(
  '/:userId',
  [
    param('userId').isInt({ min: 1 }).withMessage('Invalid user ID.'),
    body('monthly_salary')
      .notEmpty().withMessage('Monthly salary is required.')
      .isFloat({ min: 0 }).withMessage('Monthly salary must be a non-negative number.'),
    body('note').optional({ nullable: true }).trim(),
  ],
  validate,
  updateSalaryRate
);

// GET /api/salary/:userId/history — per-employee revision history
router.get(
  '/:userId/history',
  [param('userId').isInt({ min: 1 }).withMessage('Invalid user ID.')],
  validate,
  getEmployeeSalaryHistory
);

module.exports = router;
