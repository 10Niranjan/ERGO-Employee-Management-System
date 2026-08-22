'use strict';

const { query } = require('../db/pool');

/**
 * Append-only audit trail for authentication and password-reset events.
 *
 * Auditing must never be able to break the action it is recording, so failures
 * here are logged and swallowed rather than propagated — a database hiccup
 * writing the audit row shouldn't cause a legitimate password reset to 500
 * after the password has already been changed.
 */

const EVENTS = {
  ADMIN_OTP_REQUESTED: 'admin.otp.requested',
  ADMIN_OTP_VERIFIED: 'admin.otp.verified',
  ADMIN_OTP_FAILED: 'admin.otp.failed',
  ADMIN_OTP_LOCKED: 'admin.otp.locked',
  ADMIN_PASSWORD_RESET: 'admin.password.reset',
  EMPLOYEE_RESET_REQUESTED: 'employee.reset.requested',
  EMPLOYEE_RESET_VIEWED: 'employee.reset.viewed',
  EMPLOYEE_TEMP_PASSWORD_ISSUED: 'employee.temp_password.issued',
  PASSWORD_CHANGED: 'password.changed',
  LOGIN_FAILED: 'login.failed',
  LOGIN_LOCKED: 'login.locked',
  USER_DELETED: 'user.deleted',
  USER_STATUS_CHANGED: 'user.status_changed',
  SALARY_RATE_CHANGED: 'salary.rate_changed',
  ATTENDANCE_CORRECTION_REVIEWED: 'attendance.correction_reviewed',
  ATTENDANCE_OVERRIDDEN: 'attendance.overridden',
  LEAVE_APPLICATION_REVIEWED: 'leave.application_reviewed',
};

/** Pulls the caller's IP and user agent off the request for the audit row. */
function requestContext(req) {
  return {
    ip: (req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '').toString().slice(0, 64),
    userAgent: (req.headers['user-agent'] || '').toString().slice(0, 500),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.event           one of EVENTS
 * @param {number} [opts.actorUserId]   who performed the action
 * @param {number} [opts.targetUserId]  whose account it affected
 * @param {object} [opts.req]           request, for ip/user-agent
 * @param {object} [opts.meta]          extra context — never secrets
 */
async function audit({ event, actorUserId = null, targetUserId = null, req, meta = {} }) {
  try {
    const { ip, userAgent } = req ? requestContext(req) : { ip: null, userAgent: null };
    await query(
      `INSERT INTO auth_audit_log (event, actor_user_id, target_user_id, ip, user_agent, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event, actorUserId, targetUserId, ip, userAgent, JSON.stringify(meta)]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record event', event, err.message);
  }
}

module.exports = { audit, EVENTS, requestContext };
