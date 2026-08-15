'use strict';

const CHARS_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
const CHARS_DIGIT = '23456789'; // no 0/1 to avoid 0/O and 1/I confusion

/**
 * Generates a secure, human-friendly temporary password.
 * Format: Ergo@{4 digits}{2 uppercase letters}
 * Example: Ergo@5823KP
 *
 * Satisfies the password policy:
 *   - At least 8 characters ✓
 *   - Contains at least one letter ✓
 *   - Contains at least one number ✓
 */
function generateTempPassword() {
  const digits = Array.from({ length: 4 }, () =>
    CHARS_DIGIT[Math.floor(Math.random() * CHARS_DIGIT.length)]
  ).join('');

  const letters = Array.from({ length: 2 }, () =>
    CHARS_UPPER[Math.floor(Math.random() * CHARS_UPPER.length)]
  ).join('');

  return `Ergo@${digits}${letters}`;
}

module.exports = { generateTempPassword };
