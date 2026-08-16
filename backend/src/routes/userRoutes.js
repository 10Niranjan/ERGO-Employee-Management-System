'use strict';

const { Router } = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getUsers, getUserById, createUser, updateUser, updateUserStatus, deleteUser,
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
    body('name').trim().notEmpty().withMessage('Name is required.')
      .matches(/^[a-zA-Z\s]+$/).withMessage('Name must contain letters only.'),
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('phone').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[0-9]+$/).withMessage('Phone number must contain numbers only.'),
    body('designation').optional({ nullable: true }).trim(),
    body('date_of_joining').optional({ nullable: true }).isISO8601().withMessage('Date must be YYYY-MM-DD.'),
    body('monthly_salary')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Monthly salary must be a non-negative number.'),
    body('gender').optional({ nullable: true, checkFalsy: true }).trim().isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other.'),
    body('date_of_birth').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Date of birth must be YYYY-MM-DD.'),
    body('address').optional({ nullable: true }).trim(),
    body('bank_name').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[a-zA-Z\s]+$/).withMessage('Bank name must contain letters only.'),
    body('bank_account_no').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[0-9]+$/).withMessage('Bank account number must contain numbers only.'),
    body('ifsc_code').optional({ nullable: true }).trim(),
    body('emergency_contact_name').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[a-zA-Z\s]+$/).withMessage('Emergency contact name must contain letters only.'),
    body('emergency_contact_phone').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[0-9]+$/).withMessage('Emergency contact phone must contain numbers only.'),
    // Salary components
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
  ],
  validate,
  createUser
);

// PUT /api/users/:id
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee ID.'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
      .matches(/^[a-zA-Z\s]+$/).withMessage('Name must contain letters only.'),
    body('email').optional().trim().isEmail().withMessage('A valid email is required.'),
    body('phone').optional({ nullable: true, checkFalsy: true }).trim()
      .matches(/^[0-9]+$/).withMessage('Phone number must contain numbers only.'),
    body('date_of_joining').optional({ nullable: true }).isISO8601().withMessage('Date must be YYYY-MM-DD.'),
    body('monthly_salary')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Monthly salary must be a non-negative number.'),
    // Salary components
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

// DELETE /api/users/:id — permanent removal (employees only, never admins)
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee ID.')],
  validate,
  deleteUser
);

module.exports = router;
