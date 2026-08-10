'use strict';

const { query, getClient } = require('../db/pool');
const {
  getTodayIST,
  isWeekend,
  getDateRange,
  isPastSameDayLeaveCutoff,
} = require('../utils/time');

/**
 * Ensures that leave balances exist for a user in the given year.
 * Safe & idempotent: inserts defaults if missing.
 */
async function ensureUserLeaveBalances(dbOrClient, userId, year) {
  const { rows: activeLeaveTypes } = await dbOrClient.query(
    'SELECT id, yearly_quota FROM leave_types WHERE is_active = TRUE'
  );

  for (const lt of activeLeaveTypes) {
    await dbOrClient.query(
      `INSERT INTO leave_balances (user_id, leave_type_id, year, allotted, used)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
      [userId, lt.id, year, lt.yearly_quota]
    );
  }
}

/**
 * Calculates working days in a date range by excluding weekends (Sat/Sun) and active company holidays.
 */
async function calculateWorkingDays(startDateStr, endDateStr) {
  const allDates = getDateRange(startDateStr, endDateStr);
  if (allDates.length === 0) return { workingDays: [], workingDaysCount: 0 };

  const { rows: holidays } = await query(
    'SELECT date FROM holidays WHERE date >= $1 AND date <= $2 AND is_active = TRUE',
    [startDateStr, endDateStr]
  );
  const holidaySet = new Set(
    holidays.map((h) => new Date(h.date).toISOString().slice(0, 10))
  );

  const workingDays = allDates.filter(
    (d) => !isWeekend(d) && !holidaySet.has(d)
  );

  return { workingDays, workingDaysCount: workingDays.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves/balances
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaveBalances(req, res, next) {
  try {
    const currentYear = new Date().getFullYear();
    const year = parseInt(req.query.year, 10) || currentYear;

    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id, 10);
    } else if (req.user.role !== 'admin' && req.query.user_id) {
      if (parseInt(req.query.user_id, 10) !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your own leave balances.' });
      }
    }

    // Lazy initialization for this year
    await ensureUserLeaveBalances({ query }, targetUserId, year);

    const { rows } = await query(
      `SELECT lb.id, lb.user_id, lb.leave_type_id, lb.year, lb.allotted, lb.used, lb.remaining,
              lt.name, lt.is_paid, lt.yearly_quota
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1 AND lb.year = $2
       ORDER BY lt.is_paid DESC, lt.name ASC`,
      [targetUserId, year]
    );

    return res.status(200).json({
      user_id: targetUserId,
      year,
      balances: rows,
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaves
// Apply for leave (Employee)
// ─────────────────────────────────────────────────────────────────────────────
async function applyLeave(req, res, next) {
  try {
    const userId = req.user.id;
    const { leave_type_id, start_date, end_date, reason } = req.body;

    if (!leave_type_id || !start_date || !end_date || !reason || !reason.trim()) {
      return res.status(400).json({ message: 'Leave type, start date, end date, and reason are required.' });
    }

    if (start_date > end_date) {
      return res.status(400).json({ message: 'Start date cannot be after end date.' });
    }

    const todayIST = getTodayIST();

    // ── 9:00 AM IST Cutoff check for same-day leave ──────────────────────────
    if (start_date === todayIST) {
      if (isPastSameDayLeaveCutoff(9, 0)) {
        return res.status(400).json({
          message: 'Same-day leave requests must be submitted before 9:00 AM IST. Please contact your Administrator for manual approval.',
        });
      }
    } else if (start_date < todayIST) {
      return res.status(400).json({
        message: 'Leave cannot be applied for past dates. Please contact your Administrator.',
      });
    }

    // Check user is active
    const { rows: userRows } = await query(
      'SELECT id, status FROM users WHERE id = $1',
      [userId]
    );
    if (userRows.length === 0 || userRows[0].status !== 'active') {
      return res.status(403).json({ message: 'Account is inactive. Cannot apply for leave.' });
    }

    // Check leave type
    const { rows: ltRows } = await query(
      'SELECT id, name, is_paid, is_active FROM leave_types WHERE id = $1',
      [leave_type_id]
    );
    if (ltRows.length === 0 || !ltRows[0].is_active) {
      return res.status(400).json({ message: 'Selected leave type is inactive or does not exist.' });
    }
    const leaveType = ltRows[0];

    // ── Calculate working days (excluding weekends & holidays) ────────────────
    const { workingDays, workingDaysCount } = await calculateWorkingDays(start_date, end_date);
    if (workingDaysCount === 0) {
      return res.status(400).json({
        message: 'The selected date range contains only weekends and/or public holidays (0 working days).',
      });
    }

    // ── Overlapping leave check ──────────────────────────────────────────────
    const { rows: overlaps } = await query(
      `SELECT id, status, start_date, end_date
       FROM leave_applications
       WHERE user_id = $1
         AND status IN ('pending', 'approved')
         AND (start_date <= $2 AND end_date >= $3)`,
      [userId, end_date, start_date]
    );

    if (overlaps.length > 0) {
      const o = overlaps[0];
      const s = new Date(o.start_date).toISOString().slice(0, 10);
      const e = new Date(o.end_date).toISOString().slice(0, 10);
      return res.status(409).json({
        message: `You already have an active leave request (${o.status.toUpperCase()}) overlapping with these dates (${s} to ${e}).`,
      });
    }

    // ── Check paid leave balance ─────────────────────────────────────────────
    const leaveYear = parseInt(start_date.slice(0, 4), 10);

    if (leaveType.is_paid) {
      await ensureUserLeaveBalances({ query }, userId, leaveYear);
      const { rows: balRows } = await query(
        `SELECT remaining, allotted, used
         FROM leave_balances
         WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`,
        [userId, leaveType.id, leaveYear]
      );

      const remaining = balRows.length > 0 ? balRows[0].remaining : 0;
      if (remaining < workingDaysCount) {
        return res.status(400).json({
          message: `Insufficient leave balance for ${leaveType.name}. Requested: ${workingDaysCount} day(s), Available: ${remaining} day(s).`,
        });
      }
    }

    // ── Insert Leave Application ─────────────────────────────────────────────
    const { rows } = await query(
      `INSERT INTO leave_applications
         (user_id, leave_type_id, start_date, end_date, working_days_count, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, user_id, leave_type_id, start_date, end_date, working_days_count, reason, status, created_at`,
      [userId, leaveType.id, start_date, end_date, workingDaysCount, reason.trim()]
    );

    return res.status(201).json({
      message: 'Leave application submitted successfully.',
      application: rows[0],
      working_days: workingDays,
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves
// List leave applications (Role-aware: Employee own, Admin all with filters)
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaveApplications(req, res, next) {
  try {
    const statusFilter = req.query.status;
    const leaveTypeFilter = req.query.leave_type_id;
    const yearFilter = req.query.year;

    const conditions = [];
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      conditions.push(`la.user_id = $${params.length}`);
    } else {
      if (req.query.user_id) {
        params.push(parseInt(req.query.user_id, 10));
        conditions.push(`la.user_id = $${params.length}`);
      }
    }

    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter);
      conditions.push(`la.status = $${params.length}`);
    }

    if (leaveTypeFilter) {
      params.push(parseInt(leaveTypeFilter, 10));
      conditions.push(`la.leave_type_id = $${params.length}`);
    }

    if (yearFilter) {
      params.push(parseInt(yearFilter, 10));
      conditions.push(`EXTRACT(YEAR FROM la.start_date) = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT la.id, la.user_id, la.leave_type_id, la.start_date, la.end_date,
              la.working_days_count, la.reason, la.status, la.admin_notes,
              la.decline_reason, la.reviewed_at, la.created_at,
              lt.name AS leave_type_name, lt.is_paid,
              u.name AS employee_name, u.employee_id, u.designation,
              r.name AS reviewer_name
       FROM leave_applications la
       JOIN leave_types lt ON lt.id = la.leave_type_id
       JOIN users u ON u.id = la.user_id
       LEFT JOIN users r ON r.id = la.reviewed_by
       ${whereClause}
       ORDER BY la.created_at DESC`,
      params
    );

    return res.status(200).json({ applications: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/leaves/:id/status
// Admin review: Approve or Decline
// ─────────────────────────────────────────────────────────────────────────────
async function reviewLeaveApplication(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { status, decline_reason, admin_notes } = req.body;

    if (!['approved', 'declined'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Status must be 'approved' or 'declined'." });
    }

    // Fetch and lock leave application
    const { rows: appRows } = await client.query(
      `SELECT la.*, lt.is_paid, lt.name AS leave_type_name
       FROM leave_applications la
       JOIN leave_types lt ON lt.id = la.leave_type_id
       WHERE la.id = $1
       FOR UPDATE`,
      [id]
    );

    if (appRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Leave application not found.' });
    }

    const application = appRows[0];
    if (application.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cannot review request: Application has already been '${application.status}'.`,
      });
    }

    let updatedApplication;

    if (status === 'approved') {
      // If paid leave, deduct balance in transaction
      if (application.is_paid) {
        const leaveYear = parseInt(new Date(application.start_date).toISOString().slice(0, 4), 10);
        await ensureUserLeaveBalances(client, application.user_id, leaveYear);

        const { rows: balRows } = await client.query(
          `SELECT id, allotted, used, remaining
           FROM leave_balances
           WHERE user_id = $1 AND leave_type_id = $2 AND year = $3
           FOR UPDATE`,
          [application.user_id, application.leave_type_id, leaveYear]
        );

        if (balRows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Leave balance record not found.' });
        }

        const balance = balRows[0];
        if (balance.remaining < application.working_days_count) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Cannot approve leave: Employee has insufficient balance (${balance.remaining} available, ${application.working_days_count} required).`,
          });
        }

        // Deduct balance by incrementing used
        await client.query(
          `UPDATE leave_balances
           SET used = used + $1, updated_at = NOW()
           WHERE id = $2`,
          [application.working_days_count, balance.id]
        );
      }

      const { rows } = await client.query(
        `UPDATE leave_applications
         SET
           status       = 'approved',
           reviewed_by  = $1,
           reviewed_at  = NOW(),
           admin_notes  = $2,
           updated_at   = NOW()
         WHERE id = $3
         RETURNING *`,
        [req.user.id, admin_notes?.trim() || null, id]
      );
      updatedApplication = rows[0];
    } else {
      // Declined — mandatory decline_reason
      if (!decline_reason || !decline_reason.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'A decline reason is mandatory when rejecting a leave request.' });
      }

      const { rows } = await client.query(
        `UPDATE leave_applications
         SET
           status         = 'declined',
           decline_reason = $1,
           reviewed_by    = $2,
           reviewed_at    = NOW(),
           admin_notes    = $3,
           updated_at     = NOW()
         WHERE id = $4
         RETURNING *`,
        [decline_reason.trim(), req.user.id, admin_notes?.trim() || null, id]
      );
      updatedApplication = rows[0];
    }

    await client.query('COMMIT');

    return res.status(200).json({
      message: `Leave application ${status} successfully.`,
      application: updatedApplication,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  ensureUserLeaveBalances,
  calculateWorkingDays,
  getLeaveBalances,
  applyLeave,
  getLeaveApplications,
  reviewLeaveApplication,
};
