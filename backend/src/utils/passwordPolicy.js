'use strict';

const bcrypt = require('bcryptjs');

const saltRounds = () => parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

/**
 * Strong password policy used by the password-reset flows.
 *
 * The legacy POST /api/auth/reset-password endpoint keeps its original, looser
 * rules (>=8 chars, a letter and a number) so existing behaviour doesn't change
 * underneath anyone. Everything introduced by the forgot-password work — the
 * admin OTP reset and the mandatory post-temp-password change — uses the rules
 * below, which mirror the live checklist shown on those screens.
 */

const MIN_LENGTH = 8;

// Order matters: the frontend renders these in sequence as the live checklist.
const RULES = [
  { id: 'length', label: `At least ${MIN_LENGTH} characters`, test: (p) => p.length >= MIN_LENGTH },
  { id: 'uppercase', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * @param {string} password
 * @returns {{ valid: boolean, failed: string[], message: string|null }}
 */
function validatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const failed = RULES.filter((r) => !r.test(value));

  return {
    valid: failed.length === 0,
    failed: failed.map((r) => r.id),
    message: failed.length === 0 ? null : `Password must contain: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`,
  };
}

/** How many previous passwords a user may not reuse. */
const HISTORY_DEPTH = 3;

/**
 * Returns true when the candidate password matches any of the user's last
 * HISTORY_DEPTH passwords. bcrypt comparisons are intentionally slow, so this
 * is capped at a handful of hashes.
 *
 * @param {{ query: Function }} db
 * @param {number} userId
 * @param {string} candidate
 */
async function isPasswordReused(db, userId, candidate) {
  const { rows } = await db.query(
    `SELECT password_hash FROM password_history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, HISTORY_DEPTH]
  );

  for (const row of rows) {
    if (await bcrypt.compare(candidate, row.password_hash)) return true;
  }
  return false;
}

/**
 * Records a hash in the user's password history and prunes anything older than
 * the retention depth, so the table can't grow without bound.
 */
async function recordPasswordHistory(db, userId, passwordHash) {
  await db.query(
    'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
    [userId, passwordHash]
  );
  await db.query(
    `DELETE FROM password_history
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM password_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       )`,
    [userId, HISTORY_DEPTH]
  );
}

/**
 * Applies a new password to a user and terminates every existing session.
 * The one place every password-change flow must route through so the
 * security-critical steps can't drift apart between them: hash → bump
 * password_changed_at (invalidates every JWT issued before this moment,
 * per middleware/auth.js) → clear the first-login flag → record history.
 *
 * @param {{ query: Function }} db - a pool client (inside a transaction) or the plain pool/query export
 */
async function applyNewPassword(db, userId, plainPassword, { firstLogin = false } = {}) {
  const passwordHash = await bcrypt.hash(plainPassword, saltRounds());

  await db.query(
    `UPDATE users
     SET password_hash = $1,
         first_login = $2,
         password_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [passwordHash, firstLogin, userId]
  );

  await recordPasswordHistory(db, userId, passwordHash);
  return passwordHash;
}

module.exports = {
  MIN_LENGTH,
  HISTORY_DEPTH,
  RULES,
  validatePassword,
  isPasswordReused,
  recordPasswordHistory,
  applyNewPassword,
};
