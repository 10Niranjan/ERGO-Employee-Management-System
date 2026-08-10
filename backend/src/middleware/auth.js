'use strict';

const { verifyToken } = require('../utils/jwt');

/**
 * authenticate middleware
 * Validates the Bearer JWT token in the Authorization header.
 * Attaches decoded user (id, role, employee_id) to req.user on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.id,
      role: decoded.role,
      employee_id: decoded.employee_id,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid authentication token.' });
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

module.exports = { authenticate, authorizeAdmin, authorizeEmployee };
