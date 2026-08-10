'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { login, resetPassword, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// ─── Rate limiter: max 10 login attempts per 15 minutes per IP ───────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Input validation chains ─────────────────────────────────────────────────
const loginValidation = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or Employee ID is required.'),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

const resetPasswordValidation = [
  body('new_password')
    .notEmpty()
    .withMessage('New password is required.')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),
];

// ─── Validation result checker ────────────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login', loginLimiter, loginValidation, validate, login);

// POST /api/auth/reset-password  (requires valid JWT)
router.post('/reset-password', authenticate, resetPasswordValidation, validate, resetPassword);

// GET /api/auth/me  (requires valid JWT)
router.get('/me', authenticate, getMe);

module.exports = router;
