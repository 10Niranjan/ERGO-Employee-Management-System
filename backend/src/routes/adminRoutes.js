'use strict';

const { Router } = require('express');
const { param, query: qv, validationResult } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  listResetRequests,
  resolveResetRequest,
} = require('../controllers/passwordResetController');

const router = Router();

// Every route in this file is admin-only, enforced server-side.
router.use(authenticate, authorizeAdmin);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
}

// GET /api/admin/password-reset-requests
router.get(
  '/password-reset-requests',
  [
    qv('page').optional().isInt({ min: 1 }).withMessage('Invalid page number.'),
    qv('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100.'),
    qv('status').optional().isIn(['pending', 'resolved', 'expired', 'all'])
      .withMessage('Invalid status filter.'),
  ],
  validate,
  listResetRequests
);

// POST /api/admin/password-reset-requests/:id/resolve
router.post(
  '/password-reset-requests/:id/resolve',
  [param('id').isInt({ min: 1 }).withMessage('Invalid request ID.')],
  validate,
  resolveResetRequest
);

module.exports = router;
