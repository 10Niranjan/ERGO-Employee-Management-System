'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { login, resetPassword, getMe } = require('../controllers/authController');
const {
  adminForgotPassword,
  adminVerifyOtp,
  adminResetPassword,
  employeeForgotPassword,
  forceChangePassword,
} = require('../controllers/passwordResetController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Rate-limit counters are per-process and persist across test cases, so one
// suite would exhaust the budget for every later case. Limits stay fully
// active in dev and production; the live behaviour is verified separately.
const skipInTests = () => process.env.NODE_ENV === 'test';

// ─── Rate limiter: failed login attempts per 15 minutes per IP ───────────────
// Only FAILED attempts count. Counting successful ones too meant a whole
// office behind a single NAT — or one person legitimately signing in and out
// a few times — would lock everyone out, which is not what this is defending
// against. The point is to slow password guessing, and a guess that succeeds
// isn't a guess.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many failed login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTests,
});

// Per-IP cap on code requests. The matching per-account cap is enforced in the
// controller, since one attacker can rotate IPs and one NAT can hide many users.
const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: 'Too many reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});

// Guards against sweeping codes across many accounts from one host; the
// 5-attempt lockout in the controller guards a single account.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});

// Deliberately a separate, more generous bucket from the admin OTP limiter.
// Sharing one would mean a whole office behind a single NAT gets 3 password
// requests per hour between them, locking out everyone after the third.
const employeeRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'Too many reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
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

// ─── Flow 1 — Admin: email OTP self-service reset ────────────────────────────

// POST /api/auth/admin/forgot-password
router.post(
  '/admin/forgot-password',
  otpRequestLimiter,
  [body('email').trim().isEmail().withMessage('A valid email address is required.')],
  validate,
  adminForgotPassword
);

// POST /api/auth/admin/verify-otp
router.post(
  '/admin/verify-otp',
  otpVerifyLimiter,
  [
    body('email').trim().isEmail().withMessage('A valid email address is required.'),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.')
      .isNumeric().withMessage('The code contains digits only.'),
  ],
  validate,
  adminVerifyOtp
);

// POST /api/auth/admin/reset-password
router.post(
  '/admin/reset-password',
  [
    body('reset_session_token').trim().notEmpty().withMessage('Reset session token is required.'),
    body('new_password').notEmpty().withMessage('New password is required.'),
  ],
  validate,
  adminResetPassword
);

// ─── Flow 2 — Employee: admin-mediated reset ─────────────────────────────────

// POST /api/auth/employee/forgot-password
router.post(
  '/employee/forgot-password',
  employeeRequestLimiter,
  [body('identifier').trim().notEmpty().withMessage('Employee ID or email is required.')],
  validate,
  employeeForgotPassword
);

// POST /api/auth/employee/force-change-password  (requires valid JWT + first_login)
router.post(
  '/employee/force-change-password',
  authenticate,
  [body('new_password').notEmpty().withMessage('New password is required.')],
  validate,
  forceChangePassword
);

module.exports = router;
