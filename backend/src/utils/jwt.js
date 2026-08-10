'use strict';

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!SECRET) {
  throw new Error('JWT_SECRET environment variable is not set.');
}

/**
 * Sign a JWT for an authenticated user.
 * @param {{ id: number, role: string, employee_id: string }} payload
 * @returns {string} Signed JWT token
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws if invalid or expired.
 * @param {string} token
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
