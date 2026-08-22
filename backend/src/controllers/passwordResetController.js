'use strict';

const { query, getClient } = require('../db/pool');
const {
  generateOtp, hashOtp, verifyOtp,
  generateResetToken, hashResetToken, generateTempPassword,
} = require('../utils/secureTokens');
const {
  validatePassword, isPasswordReused, applyNewPassword,
} = require('../utils/passwordPolicy');
const { sendAdminOtpEmail, sendPasswordChangedEmail } = require('../services/mailer');
const { audit, EVENTS } = require('../services/auditLog');

// ─── Policy constants ────────────────────────────────────────────────────────
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 3;
const RESET_SESSION_TTL_MINUTES = 10;
const TEMP_PASSWORD_TTL_HOURS = 48;

// Identical response for every outcome of a request-initiation endpoint, so
// the caller can't tell whether an account exists.
const GENERIC_OTP_RESPONSE = { message: 'If an admin account matches, a code has been sent.' };
const GENERIC_REQUEST_RESPONSE = {
  message: 'If an account matches, your request has been sent to your administrator.',
};

// ═════════════════════════════════════════════════════════════════════════════
// FLOW 1 — ADMIN: email OTP self-service reset
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/auth/admin/forgot-password  { email } */
async function adminForgotPassword(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    const { rows } = await query(
      `SELECT id, name, email FROM users
       WHERE LOWER(email) = $1 AND role = 'admin' AND status = 'active'
       LIMIT 1`,
      [email]
    );

    // Unknown / non-admin / inactive address: respond exactly as if it worked.
    if (rows.length === 0) {
      await audit({ event: EVENTS.ADMIN_OTP_REQUESTED, req, meta: { matched: false } });
      return res.status(200).json(GENERIC_OTP_RESPONSE);
    }

    const admin = rows[0];

    // Per-account throttle (the per-IP limit lives in the route's rate limiter).
    const { rows: recent } = await query(
      `SELECT COUNT(*)::int AS count FROM admin_otp_requests
       WHERE admin_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [admin.id]
    );
    if (recent[0].count >= OTP_MAX_PER_HOUR) {
      await audit({
        event: EVENTS.ADMIN_OTP_REQUESTED, targetUserId: admin.id, req,
        meta: { matched: true, throttled: true },
      });
      // Still generic — a throttle message would confirm the account exists.
      return res.status(200).json(GENERIC_OTP_RESPONSE);
    }

    // Supersede any still-open code so only the newest one can be used.
    await query(
      `UPDATE admin_otp_requests SET consumed_at = NOW()
       WHERE admin_id = $1 AND consumed_at IS NULL`,
      [admin.id]
    );

    const otp = generateOtp();
    await query(
      `INSERT INTO admin_otp_requests (admin_id, otp_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes')`,
      [admin.id, hashOtp(otp)]
    );

    await sendAdminOtpEmail(admin.email, otp, OTP_TTL_MINUTES);
    await audit({
      event: EVENTS.ADMIN_OTP_REQUESTED, targetUserId: admin.id, req,
      meta: { matched: true },
    });

    return res.status(200).json(GENERIC_OTP_RESPONSE);
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/admin/verify-otp  { email, otp } */
async function adminVerifyOtp(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    const invalid = () => res.status(400).json({ message: 'Invalid or expired code.' });

    const { rows: adminRows } = await query(
      `SELECT id, name, email FROM users
       WHERE LOWER(email) = $1 AND role = 'admin' AND status = 'active'
       LIMIT 1`,
      [email]
    );
    if (adminRows.length === 0) return invalid();
    const admin = adminRows[0];

    const { rows: otpRows } = await query(
      `SELECT id, otp_hash, expires_at, attempt_count
       FROM admin_otp_requests
       WHERE admin_id = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [admin.id]
    );
    if (otpRows.length === 0) return invalid();

    const record = otpRows[0];

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      await audit({
        event: EVENTS.ADMIN_OTP_FAILED, targetUserId: admin.id, req,
        meta: { reason: 'expired' },
      });
      return res.status(400).json({ message: 'This code has expired. Please request a new one.' });
    }

    if (record.attempt_count >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    if (!verifyOtp(otp, record.otp_hash)) {
      const { rows: updated } = await query(
        `UPDATE admin_otp_requests SET attempt_count = attempt_count + 1
         WHERE id = $1
         RETURNING attempt_count`,
        [record.id]
      );
      const attempts = updated[0].attempt_count;
      const locked = attempts >= OTP_MAX_ATTEMPTS;

      if (locked) {
        // Burn the code entirely — a fresh request is now required.
        await query('UPDATE admin_otp_requests SET consumed_at = NOW() WHERE id = $1', [record.id]);
        await audit({ event: EVENTS.ADMIN_OTP_LOCKED, targetUserId: admin.id, req, meta: { attempts } });
        return res.status(429).json({
          message: 'Too many incorrect attempts. Please request a new code.',
        });
      }

      await audit({
        event: EVENTS.ADMIN_OTP_FAILED, targetUserId: admin.id, req,
        meta: { reason: 'mismatch', attempts },
      });
      return res.status(400).json({
        message: 'Incorrect code.',
        attempts_remaining: OTP_MAX_ATTEMPTS - attempts,
      });
    }

    // Correct code — consume it and mint a single-use reset session token.
    await query('UPDATE admin_otp_requests SET consumed_at = NOW() WHERE id = $1', [record.id]);

    const resetToken = generateResetToken();
    await query(
      `INSERT INTO admin_reset_sessions (admin_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${RESET_SESSION_TTL_MINUTES} minutes')`,
      [admin.id, hashResetToken(resetToken)]
    );

    await audit({ event: EVENTS.ADMIN_OTP_VERIFIED, targetUserId: admin.id, req });

    return res.status(200).json({
      reset_session_token: resetToken,
      expires_in_minutes: RESET_SESSION_TTL_MINUTES,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/admin/reset-password  { reset_session_token, new_password } */
async function adminResetPassword(req, res, next) {
  const client = await getClient();
  try {
    const token = String(req.body.reset_session_token || '');
    const newPassword = String(req.body.new_password || '');

    const policy = validatePassword(newPassword);
    if (!policy.valid) {
      return res.status(400).json({ message: policy.message, failed_rules: policy.failed });
    }

    await client.query('BEGIN');

    // Lock the session row so two concurrent submits can't both consume it.
    const { rows } = await client.query(
      `SELECT s.id, s.admin_id, s.expires_at, s.consumed_at, u.email, u.name
       FROM admin_reset_sessions s
       JOIN users u ON u.id = s.admin_id
       WHERE s.token_hash = $1
       FOR UPDATE OF s`,
      [hashResetToken(token)]
    );

    if (rows.length === 0 || rows[0].consumed_at ||
        new Date(rows[0].expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'This reset link has expired or was already used. Please start again.',
      });
    }

    const session = rows[0];

    if (await isPasswordReused(client, session.admin_id, newPassword)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'You cannot reuse one of your last 3 passwords. Please choose a different one.',
      });
    }

    await applyNewPassword(client, session.admin_id, newPassword, { firstLogin: false });

    await client.query(
      'UPDATE admin_reset_sessions SET consumed_at = NOW() WHERE id = $1',
      [session.id]
    );
    // Any other codes/sessions for this admin die with the reset.
    await client.query(
      `UPDATE admin_otp_requests SET consumed_at = NOW()
       WHERE admin_id = $1 AND consumed_at IS NULL`,
      [session.admin_id]
    );
    await client.query(
      `UPDATE admin_reset_sessions SET consumed_at = NOW()
       WHERE admin_id = $1 AND consumed_at IS NULL`,
      [session.admin_id]
    );

    await client.query('COMMIT');

    await audit({ event: EVENTS.ADMIN_PASSWORD_RESET, targetUserId: session.admin_id, req });
    await sendPasswordChangedEmail(session.email, session.name);

    return res.status(200).json({
      message: 'Password updated. Please log in with your new password.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FLOW 2 — EMPLOYEE: admin-mediated reset
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/auth/employee/forgot-password  { identifier } */
async function employeeForgotPassword(req, res, next) {
  try {
    const identifier = String(req.body.identifier || '').trim();

    const { rows } = await query(
      `SELECT id, name, employee_id FROM users
       WHERE (LOWER(email) = LOWER($1) OR LOWER(employee_id) = LOWER($1))
         AND role = 'employee' AND status = 'active'
       LIMIT 1`,
      [identifier]
    );

    if (rows.length === 0) {
      await audit({ event: EVENTS.EMPLOYEE_RESET_REQUESTED, req, meta: { matched: false } });
      return res.status(200).json(GENERIC_REQUEST_RESPONSE);
    }

    const employee = rows[0];

    // A partial unique index enforces one pending request per employee, so a
    // resubmission surfaces the existing row rather than creating a duplicate.
    await query(
      `INSERT INTO password_reset_requests (employee_id, status)
       VALUES ($1, 'pending')
       ON CONFLICT (employee_id) WHERE status = 'pending' DO NOTHING`,
      [employee.id]
    );

    await audit({
      event: EVENTS.EMPLOYEE_RESET_REQUESTED, targetUserId: employee.id, req,
      meta: { matched: true },
    });

    return res.status(200).json(GENERIC_REQUEST_RESPONSE);
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/password-reset-requests?status=&page=&limit= (admin only) */
async function listResetRequests(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status;

    // Lazily age out temp passwords that were issued but never used.
    await query(
      `UPDATE password_reset_requests
       SET status = 'expired'
       WHERE status = 'resolved' AND temp_expires_at IS NOT NULL AND temp_expires_at <= NOW()`
    );

    const conditions = [];
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM password_reset_requests r ${where}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT r.id, r.employee_id AS user_id, r.requested_at, r.status,
              r.resolved_at, r.temp_expires_at,
              u.name AS employee_name, u.employee_id, u.designation, u.email,
              a.name AS resolved_by_name
       FROM password_reset_requests r
       JOIN users u ON u.id = r.employee_id
       LEFT JOIN users a ON a.id = r.resolved_by_admin_id
       ${where}
       ORDER BY
         CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
         r.requested_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = countResult.rows[0].total;
    return res.status(200).json({
      requests: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/password-reset-requests/:id/resolve (admin only)
 * Generates a temp password, returns it exactly once, and never stores it.
 */
async function resolveResetRequest(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT r.id, r.employee_id, r.status, u.name, u.email, u.employee_id AS emp_code
       FROM password_reset_requests r
       JOIN users u ON u.id = r.employee_id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Reset request not found.' });
    }

    const request = rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `This request is already ${request.status}.` });
    }

    const tempPassword = generateTempPassword();

    // first_login = true forces the mandatory change screen on next sign-in.
    await applyNewPassword(client, request.employee_id, tempPassword, { firstLogin: true });

    await client.query(
      `UPDATE password_reset_requests
       SET status = 'resolved',
           resolved_by_admin_id = $1,
           resolved_at = NOW(),
           temp_expires_at = NOW() + INTERVAL '${TEMP_PASSWORD_TTL_HOURS} hours'
       WHERE id = $2`,
      [adminId, request.id]
    );

    await client.query('COMMIT');

    await audit({
      event: EVENTS.EMPLOYEE_TEMP_PASSWORD_ISSUED,
      actorUserId: adminId,
      targetUserId: request.employee_id,
      req,
      meta: { request_id: request.id, expires_in_hours: TEMP_PASSWORD_TTL_HOURS },
    });

    // The only time this value is ever returned. It is not stored anywhere in
    // plaintext and cannot be retrieved again.
    return res.status(200).json({
      temp_password: tempPassword,
      expires_in_hours: TEMP_PASSWORD_TTL_HOURS,
      employee: { name: request.name, employee_id: request.emp_code, email: request.email },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/auth/employee/force-change-password  { new_password }
 * Callable only by an authenticated user who is still flagged first_login.
 */
async function forceChangePassword(req, res, next) {
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
      'SELECT id, name, email, first_login FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found.' });
    }
    if (!rows[0].first_login) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'No password change is pending for this account.',
      });
    }

    if (await isPasswordReused(client, userId, newPassword)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'You cannot reuse one of your last 3 passwords. Please choose a different one.',
      });
    }

    await applyNewPassword(client, userId, newPassword, { firstLogin: false });

    // Close out the request that issued the temp password, if any.
    await client.query(
      `UPDATE password_reset_requests
       SET temp_expires_at = NULL
       WHERE employee_id = $1 AND status = 'resolved'`,
      [userId]
    );

    await client.query('COMMIT');

    await audit({ event: EVENTS.PASSWORD_CHANGED, actorUserId: userId, targetUserId: userId, req });
    await sendPasswordChangedEmail(rows[0].email, rows[0].name);

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

module.exports = {
  adminForgotPassword,
  adminVerifyOtp,
  adminResetPassword,
  employeeForgotPassword,
  listResetRequests,
  resolveResetRequest,
  forceChangePassword,
  // exported for tests
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  TEMP_PASSWORD_TTL_HOURS,
};
