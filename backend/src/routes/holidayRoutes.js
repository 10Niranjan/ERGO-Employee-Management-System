'use strict';

const { Router } = require('express');
const { body, param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
} = require('../controllers/holidayController');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// GET /api/holidays — any authenticated user
router.get(
  '/',
  authenticate,
  [qv('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.')],
  validate,
  getHolidays
);

// POST /api/holidays — admin only
router.post(
  '/',
  authenticate, authorizeAdmin,
  [
    body('name').trim().notEmpty().withMessage('Holiday name is required.'),
    body('date').isISO8601().withMessage('Date must be in YYYY-MM-DD format.'),
  ],
  validate,
  createHoliday
);

// PUT /api/holidays/:id — admin only
router.put(
  '/:id',
  authenticate, authorizeAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid holiday ID.'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    body('date').optional().isISO8601().withMessage('Date must be in YYYY-MM-DD format.'),
  ],
  validate,
  updateHoliday
);

// DELETE /api/holidays/:id — admin only
router.delete(
  '/:id',
  authenticate, authorizeAdmin,
  [param('id').isInt({ min: 1 }).withMessage('Invalid holiday ID.')],
  validate,
  deleteHoliday
);

module.exports = router;
