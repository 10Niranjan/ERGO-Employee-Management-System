'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveTypeStatus,
} = require('../controllers/leaveTypeController');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// GET /api/leave-types — any authenticated user
router.get('/', authenticate, getLeaveTypes);

// All mutation routes — admin only
router.post(
  '/',
  authenticate, authorizeAdmin,
  [
    body('name').trim().notEmpty().withMessage('Leave type name is required.'),
    body('is_paid').isBoolean().withMessage("'is_paid' must be true or false."),
    body('yearly_quota')
      .isInt({ min: 0 })
      .withMessage('Yearly quota must be a non-negative integer.'),
  ],
  validate,
  createLeaveType
);

router.put(
  '/:id',
  authenticate, authorizeAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid leave type ID.'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    body('is_paid').optional().isBoolean().withMessage("'is_paid' must be true or false."),
    body('yearly_quota').optional().isInt({ min: 0 }).withMessage('Yearly quota must be >= 0.'),
  ],
  validate,
  updateLeaveType
);

router.patch(
  '/:id/status',
  authenticate, authorizeAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid leave type ID.'),
    body('is_active').isBoolean().withMessage("'is_active' must be true or false."),
  ],
  validate,
  toggleLeaveTypeStatus
);

module.exports = router;
