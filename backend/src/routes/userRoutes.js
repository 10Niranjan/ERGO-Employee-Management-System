'use strict';

const { Router } = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getUsers, getUserById, createUser, updateUser, updateUserStatus,
} = require('../controllers/userController');

const router = Router();

// All user-management routes are Admin only
router.use(authenticate, authorizeAdmin);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// GET /api/users
router.get(
  '/',
  [
    qv('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
    qv('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100.'),
    qv('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive.'),
  ],
  validate,
  getUsers
);

// GET /api/users/:id
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee ID.')],
  validate,
  getUserById
);

// POST /api/users
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('phone').optional({ nullable: true }).trim(),
    body('designation').optional({ nullable: true }).trim(),
    body('date_of_joining').optional({ nullable: true }).isISO8601().withMessage('Date must be YYYY-MM-DD.'),
    body('per_day_salary')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Per-day salary must be a non-negative number.'),
    body('leaves_this_year')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Leaves this year must be a non-negative integer.'),
  ],
  validate,
  createUser
);

// PUT /api/users/:id
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee ID.'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    body('email').optional().trim().isEmail().withMessage('A valid email is required.'),
    body('date_of_joining').optional({ nullable: true }).isISO8601().withMessage('Date must be YYYY-MM-DD.'),
    body('per_day_salary')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Per-day salary must be a non-negative number.'),
  ],
  validate,
  updateUser
);

// PATCH /api/users/:id/status
router.patch(
  '/:id/status',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee ID.'),
    body('status').isIn(['active', 'inactive']).withMessage("Status must be 'active' or 'inactive'."),
  ],
  validate,
  updateUserStatus
);

module.exports = router;
