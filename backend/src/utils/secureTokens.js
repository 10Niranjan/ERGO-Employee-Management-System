'use strict';

/**
 * Secret material for the password-reset flows.
 *
 * Hard rule enforced by this module: the plaintext OTP and the plaintext reset
 * session token exist only in memory and in the email/HTTP response. Everything
 * that reaches the database is a one-way hash, and nothing here is ever logged.
 */

const crypto = require('crypto');

// OTPs are hashed with a keyed HMAC rather than a plain digest so that a
// leaked database alone can't be brute-forced offline — a 6-digit space is
// only 900k candidates, which is trivially searchable without the key.
const OTP_PEPPER = process.env.OTP_PEPPER || process.env.JWT_SECRET;

if (!OTP_PEPPER) {
  throw new Error('OTP_PEPPER (or JWT_SECRET) must be set to hash password-reset OTPs.');
}

/** Cryptographically random 6-digit numeric code, zero-padded. */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Keyed one-way hash of an OTP. Safe to persist. */
function hashOtp(otp) {
  return crypto.createHmac('sha256', OTP_PEPPER).update(String(otp)).digest('hex');
}

/**
 * Compares a submitted OTP against a stored hash in constant time, so response
 * timing can't be used to narrow down the correct code digit by digit.
 */
function verifyOtp(submittedOtp, storedHash) {
  const candidate = Buffer.from(hashOtp(submittedOtp), 'hex');
  const expected = Buffer.from(String(storedHash), 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/** 32 random bytes, hex-encoded — the reset session token handed to the client. */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Plain SHA-256 is sufficient here: the token is already 256 bits of entropy. */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Cryptographically random temporary password that satisfies the strong policy
 * (length, uppercase, lowercase, number, symbol).
 *
 * Ambiguous glyphs (O/0, I/l/1) are excluded because an admin has to read this
 * aloud or paste it into a chat to hand it to the employee.
 */
function generateTempPassword() {
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';
  const DIGIT = '23456789';
  const SYMBOL = '@#$%&*!?';

  const pick = (set) => set[crypto.randomInt(0, set.length)];

  // Guarantee one of each required class, then fill to length 14.
  const required = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  const rest = Array.from({ length: 10 }, () => pick(all));

  // Fisher-Yates with a CSPRNG so the guaranteed characters aren't always first.
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  generateResetToken,
  hashResetToken,
  generateTempPassword,
};
