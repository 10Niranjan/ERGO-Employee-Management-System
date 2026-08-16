'use strict';

const { verifyToken } = require('../utils/jwt');
const { pool } = require('../db/pool');

const SESSION_ENDED_MSG = 'Session ended. Please log in again.';

/**
 * authenticate middleware
 * Validates the Bearer JWT token in the Authorization header.
 * Attaches decoded user (id, role, employee_id) to req.user on success.
 *
 * Because auth is stateless JWT with no session store, "log out of all
 * devices" is enforced here: every request re-checks the account against
 * users.password_changed_at and rejects any token minted before the last
 * password change. The same lookup also catches accounts deactivated
 * mid-session, which previously kept working until the token expired.
 *
 * This deliberately uses the raw `pool` rather than the shared `query` helper
 * so the middleware's lookup stays independent of the per-request mock chains
 * the controller tests set up on `query`.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid authentication token.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT status, first_login, password_changed_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (rows.length === 0 || rows[0].status !== 'active') {
      return res.status(401).json({ message: SESSION_ENDED_MSG });
    }

    // `iat` is whole seconds, so compare at second precision — otherwise a
    // token minted in the same second as the password change would be
    // rejected immediately after a legitimate reset-and-relogin.
    const changedAt = rows[0].password_changed_at;
    if (changedAt && decoded.iat) {
      const changedAtSec = Math.floor(new Date(changedAt).getTime() / 1000);
      if (decoded.iat < changedAtSec) {
        return res.status(401).json({ message: SESSION_ENDED_MSG });
      }
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      employee_id: decoded.employee_id,
      first_login: rows[0].first_login,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * authorizeAdmin middleware
 * Must be used AFTER authenticate.
 * Allows only users with role === 'admin'.
 */
function authorizeAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
}

/**
 * authorizeEmployee middleware
 * Must be used AFTER authenticate.
 * Allows both employees and admins (any authenticated user).
 */
function authorizeEmployee(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  next();
}

/**
 * blockUntilPasswordChanged
 * Must be used AFTER authenticate.
 *
 * While an account is flagged first_login — a brand-new hire, or an employee
 * who has just been issued a temporary password — it may not touch any
 * business data until a new password is set. The frontend redirects to the
 * mandatory reset screen, but a redirect is only a UI convention: without
 * this, the token still works against the API directly.
 *
 * The password-change endpoints themselves live on /api/auth and are not
 * mounted behind this guard, so the user can always get out of the state.
 */
function blockUntilPasswordChanged(req, res, next) {
  if (req.user?.first_login) {
    return res.status(403).json({
      message: 'Please set a new password before continuing.',
      must_change_password: true,
    });
  }
  next();
}

module.exports = {
  authenticate,
  authorizeAdmin,
  authorizeEmployee,
  blockUntilPasswordChanged,
};
