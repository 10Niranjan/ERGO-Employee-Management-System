'use strict';

/**
 * Outbound email for the password-reset flows.
 *
 * Transport selection:
 *   1. SMTP_HOST configured  → real SMTP via nodemailer.
 *   2. Not configured, non-production → console transport, so the whole OTP
 *      flow is testable locally without credentials.
 *   3. Not configured, production → hard failure. Silently swallowing a
 *      password-reset email in production would strand the admin with a code
 *      that was never delivered.
 */

const nodemailer = require('nodemailer');

const FROM = process.env.MAIL_FROM || 'ERGO Management <no-reply@ergo-asia.co>';
const SUPPORT = process.env.SUPPORT_EMAIL || 'it@ergo-asia.co';
const isProduction = () => process.env.NODE_ENV === 'production';
const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

let cachedTransport = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  if (smtpConfigured()) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    return cachedTransport;
  }

  if (isProduction()) {
    throw new Error(
      'SMTP is not configured (SMTP_HOST missing). Refusing to silently drop a password-reset email in production.'
    );
  }

  return null; // dev console transport — handled in sendMail()
}

/**
 * @param {{ to: string, subject: string, text: string }} msg
 */
async function sendMail({ to, subject, text }) {
  const transport = getTransport();

  if (!transport) {
    // Local development only — unreachable in production, where getTransport()
    // throws instead. This is the single place a reset code is ever rendered
    // outside a real email, which keeps the "never log secrets" rule intact
    // everywhere it actually matters.
    /* eslint-disable no-console */
    console.log('\n──────── ✉  DEV EMAIL (no SMTP configured) ────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('───────────────────────────────────────────────────\n');
    /* eslint-enable no-console */
    return { delivered: false, transport: 'console' };
  }

  await transport.sendMail({ from: FROM, to, subject, text });
  return { delivered: true, transport: 'smtp' };
}

/** Flow 1, step 3 — deliver the admin's 6-digit reset code. */
async function sendAdminOtpEmail(to, otp, expiryMinutes) {
  return sendMail({
    to,
    subject: 'Your ERGO password reset code',
    text:
      `You requested a password reset for your ERGO admin account.\n\n` +
      `    CODE: ${otp}\n\n` +
      `It expires in ${expiryMinutes} minutes and can only be used once.\n\n` +
      `If you didn't request this, you can ignore this email — your password has not been changed.\n\n` +
      `— ERGO Management System`,
  });
}

/** Sent after ANY successful password change, to the account owner. */
async function sendPasswordChangedEmail(to, name) {
  return sendMail({
    to,
    subject: 'Your ERGO password was changed',
    text:
      `Hi ${name || 'there'},\n\n` +
      `Your ERGO account password was just changed, and you have been signed out on all devices.\n\n` +
      `If this wasn't you, contact IT immediately at ${SUPPORT}.\n\n` +
      `— ERGO Management System`,
  });
}

module.exports = { sendMail, sendAdminOtpEmail, sendPasswordChangedEmail, SUPPORT };
