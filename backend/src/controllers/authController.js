'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { signToken } = require('../utils/jwt');

// Generic message used for ALL login failures — prevents user enumeration.
const INVALID_CREDENTIALS_MSG = 'Invalid credentials. Please try again.';

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
      `SELECT id, employee_id, role, name, email, password_hash, first_login, status
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

    // Verify password
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: INVALID_CREDENTIALS_MSG });
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
 * Forces re-login after a successful reset.
 */
async function resetPassword(req, res, next) {
  try {
    const { new_password } = req.body;
    const userId = req.user.id;

    if (!new_password) {
      return res.status(400).json({ message: 'New password is required.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    // Enforce basic complexity: at least one letter, one number
    if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return res.status(400).json({
        message: 'Password must contain at least one letter and one number.',
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
    const passwordHash = await bcrypt.hash(new_password, saltRounds);

    await query(
      `UPDATE users
       SET password_hash = $1, first_login = FALSE, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, userId]
    );

    // Return 200 with a message instructing the frontend to discard the current token
    // and redirect to login (token is still technically valid until it expires,
    // but first_login = FALSE so the reset page won't be accessible again).
    return res.status(200).json({
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch (err) {
    next(err);
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
      `SELECT id, employee_id, role, name, email, designation, date_of_joining, first_login, status
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
