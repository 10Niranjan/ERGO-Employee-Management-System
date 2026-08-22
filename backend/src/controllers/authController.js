'use strict';

const bcrypt = require('bcryptjs');
const { query, getClient } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const { validatePassword, isPasswordReused, applyNewPassword } = require('../utils/passwordPolicy');
const { sendPasswordChangedEmail } = require('../services/mailer');
const { audit, EVENTS } = require('../services/auditLog');

// Generic message used for ALL login failures — prevents user enumeration.
const INVALID_CREDENTIALS_MSG = 'Invalid credentials. Please try again.';

// Per-account lockout, on top of the per-IP rate limiter in authRoutes.js.
// The IP limiter alone doesn't catch a slow, distributed guessing attempt
// spread across many IPs against one specific employee_id — mirrors the
// 5-attempt lock already used for admin OTP verification.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

/**
 * POST /api/auth/login
 * Accepts: { identifier: string (email OR employee_id), password: string }
 * Returns: { token, user: { id, employee_id, role, name, email, first_login } }
 */
async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required.' });
    }

    // Look up by email OR employee_id
    const { rows } = await query(
      `SELECT id, employee_id, role, name, email, phone, designation, date_of_joining,
              gender, bank_name, password_hash, first_login, status,
              failed_login_attempts, login_locked_until
       FROM users
       WHERE (LOWER(email) = LOWER($1) OR LOWER(employee_id) = LOWER($1))
       LIMIT 1`,
      [identifier.trim()]
    );

    if (rows.length === 0) {
      // No account found — return generic message to prevent enumeration
      return res.status(401).json({ message: INVALID_CREDENTIALS_MSG });
    }

    const user = rows[0];

    // Inactive account check (still generic message for security)
    if (user.status !== 'active') {
      return res.status(401).json({ message: INVALID_CREDENTIALS_MSG });
    }

    // Account-level lockout, independent of the per-IP rate limiter
    if (user.login_locked_until && new Date(user.login_locked_until).getTime() > Date.now()) {
      return res.status(429).json({ message: 'Too many failed login attempts. Please try again later.' });
    }

    // Verify password
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      const attempts = user.failed_login_attempts + 1;
      const locked = attempts >= LOGIN_MAX_ATTEMPTS;

      await query(
        `UPDATE users
         SET failed_login_attempts = $1,
             login_locked_until = ${locked ? `NOW() + INTERVAL '${LOGIN_LOCKOUT_MINUTES} minutes'` : 'login_locked_until'}
         WHERE id = $2`,
        [attempts, user.id]
      );

      if (locked) {
        await audit({ event: EVENTS.LOGIN_LOCKED, targetUserId: user.id, req, meta: { attempts } });
        return res.status(429).json({ message: 'Too many failed login attempts. Please try again later.' });
      }

      await audit({ event: EVENTS.LOGIN_FAILED, targetUserId: user.id, req, meta: { attempts } });
      return res.status(401).json({ message: INVALID_CREDENTIALS_MSG });
    }

    // Successful login clears any accumulated failures
    if (user.failed_login_attempts > 0 || user.login_locked_until) {
      await query(
        `UPDATE users SET failed_login_attempts = 0, login_locked_until = NULL WHERE id = $1`,
        [user.id]
      );
    }

    // Sign JWT
    const token = signToken({
      id: user.id,
      role: user.role,
      employee_id: user.employee_id,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        designation: user.designation,
        date_of_joining: user.date_of_joining,
        gender: user.gender,
        bank_name: user.bank_name,
        first_login: user.first_login,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Requires: authenticate middleware (valid JWT)
 * Accepts: { new_password: string }
 * Voluntary, anytime password change for an already-signed-in user — not the
 * mandatory first-login change (that's POST /api/auth/employee/force-change-password).
 * Routes through the same applyNewPassword() every other password-change flow
 * uses, so this one doesn't quietly skip password_changed_at (which is what
 * actually revokes every other still-valid session on a password change —
 * see middleware/auth.js) or the reuse/history checks the other flows enforce.
 */
async function resetPassword(req, res, next) {
  const client = await getClient();
  try {
    const newPassword = String(req.body.new_password || '');
    const userId = req.user.id;

    const policy = validatePassword(newPassword);
    if (!policy.valid) {
      return res.status(400).json({ message: policy.message, failed_rules: policy.failed });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, name, email FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found.' });
    }

    if (await isPasswordReused(client, userId, newPassword)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'You cannot reuse one of your last 3 passwords. Please choose a different one.',
      });
    }

    await applyNewPassword(client, userId, newPassword, { firstLogin: false });

    await client.query('COMMIT');

    await audit({ event: EVENTS.PASSWORD_CHANGED, actorUserId: userId, targetUserId: userId, req });
    await sendPasswordChangedEmail(rows[0].email, rows[0].name);

    // Return 200 with a message instructing the frontend to discard the current token
    // and redirect to login — password_changed_at now invalidates it server-side too.
    return res.status(200).json({
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/auth/me
 * Requires: authenticate middleware
 * Returns the current user's profile (no password hash).
 */
async function getMe(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, employee_id, role, name, email, phone, designation, date_of_joining, gender, bank_name, first_login, status
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, resetPassword, getMe };
