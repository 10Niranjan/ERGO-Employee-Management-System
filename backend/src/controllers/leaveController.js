'use strict';

const { query, getClient } = require('../db/pool');
const {
  getTodayIST,
  isWeekend,
  getDateRange,
  isPastSameDayLeaveCutoff,
} = require('../utils/time');
const {
  applyLedgerEntry, recordInitialAllocation,
  evaluateEmployeeForPeriod, runAccrualForPeriod,
} = require('../services/leaveAccrualService');
const { getMostRecentlyCompletedPeriod } = require('../utils/time');

/**
 * Ensures that leave balances exist for a user in the given year.
 * Safe & idempotent: inserts defaults if missing.
 * Logs an INITIAL_ALLOCATION ledger entry only for rows genuinely created here
 * (ON CONFLICT DO NOTHING + RETURNING means pre-existing rows return no id).
 */
async function ensureUserLeaveBalances(dbOrClient, userId, year) {
  const { rows: activeLeaveTypes } = await dbOrClient.query(
    'SELECT id, yearly_quota FROM leave_types WHERE is_active = TRUE'
  );

  for (const lt of activeLeaveTypes) {
    const { rows: inserted } = await dbOrClient.query(
      `INSERT INTO leave_balances (user_id, leave_type_id, year, allotted, used)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (user_id, leave_type_id, year) DO NOTHING
       RETURNING id`,
      [userId, lt.id, year, lt.yearly_quota]
    );
    if (inserted.length) {
      await recordInitialAllocation(dbOrClient, {
        userId, leaveTypeId: lt.id, year, allotted: lt.yearly_quota,
        note: `Base allocation ${lt.yearly_quota}`,
      });
    }
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
    // Admin filing on behalf of an employee (e.g. backdated leave): identified by
    // role + presence of a target user_id. Everything below keeps operating on
    // `userId`, so the self-service path is untouched when this is false.
    const isAdminFiling = req.user.role === 'admin' && !!req.body.user_id;
    const userId = isAdminFiling ? parseInt(req.body.user_id, 10) : req.user.id;
    const { leave_type_id, start_date, end_date, reason } = req.body;

    if (!leave_type_id || !start_date || !end_date || !reason || !reason.trim()) {
      return res.status(400).json({ message: 'Leave type, start date, end date, and reason are required.' });
    }

    if (start_date > end_date) {
      return res.status(400).json({ message: 'Start date cannot be after end date.' });
    }

    const todayIST = getTodayIST();

    // Same-day cutoff and past-date restrictions exist to stop employees
    // self-service-backdating their own leave — they don't apply when an
    // admin is deliberately filing a backdated record on someone's behalf.
    if (!isAdminFiling) {
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

    // ── Admin-on-behalf-of: insert + auto-approve, atomically ────────────────
    // Balance deduction must be transactional (same invariant as the regular
    // PUT /:id/status approval path), so this branch uses its own client
    // rather than the plain `query` the self-service path below uses.
    if (isAdminFiling) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows: insertedRows } = await client.query(
          `INSERT INTO leave_applications
             (user_id, leave_type_id, start_date, end_date, working_days_count, reason, status, filed_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
           RETURNING *`,
          [userId, leaveType.id, start_date, end_date, workingDaysCount, reason.trim(), req.user.id]
        );

        const approved = await approvePendingApplication(
          client,
          { ...insertedRows[0], is_paid: leaveType.is_paid, leave_type_name: leaveType.name },
          { reviewerId: req.user.id, adminNotes: 'Backdated leave filed and auto-approved by admin on behalf of employee.' }
        );

        await client.query('COMMIT');
        return res.status(201).json({
          message: 'Leave filed and approved on behalf of employee successfully.',
          application: approved,
          working_days: workingDays,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        if (err.statusCode) {
          return res.status(err.statusCode).json({ message: err.message });
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // ── Insert Leave Application (self-service, stays pending for review) ────
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
              la.decline_reason, la.reviewed_at, la.created_at, la.filed_by,
              lt.name AS leave_type_name, lt.is_paid,
              u.name AS employee_name, u.employee_id, u.designation,
              r.name AS reviewer_name,
              f.name AS filed_by_name
       FROM leave_applications la
       JOIN leave_types lt ON lt.id = la.leave_type_id
       JOIN users u ON u.id = la.user_id
       LEFT JOIN users r ON r.id = la.reviewed_by
       LEFT JOIN users f ON f.id = la.filed_by
       ${whereClause}
       ORDER BY la.created_at DESC`,
      params
    );

    return res.status(200).json({ applications: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Approves a pending leave application: for paid leave, deducts balance with a
 * matching ledger entry (row-locked, atomic); always marks the application
 * approved. Must be called with an active transactional client (caller has
 * already issued BEGIN). Shared by the admin review endpoint and by
 * admin-on-behalf-of filing (applyLeave), so balance-deduction logic lives in
 * exactly one place.
 * Throws an Error with .statusCode set for expected failure cases (400s) —
 * caller is responsible for ROLLBACK + mapping to an HTTP response.
 */
async function approvePendingApplication(client, application, { reviewerId, adminNotes }) {
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
      const err = new Error('Leave balance record not found.');
      err.statusCode = 400;
      throw err;
    }

    const balance = balRows[0];
    if (balance.remaining < application.working_days_count) {
      const err = new Error(
        `Cannot approve leave: Employee has insufficient balance (${balance.remaining} available, ${application.working_days_count} required).`
      );
      err.statusCode = 400;
      throw err;
    }

    await applyLedgerEntry(client, {
      userId: application.user_id,
      leaveTypeId: application.leave_type_id,
      year: leaveYear,
      entryType: 'LEAVE_TAKEN',
      amount: application.working_days_count,
      note: `${application.leave_type_name}: ${new Date(application.start_date).toISOString().slice(0, 10)} to ${new Date(application.end_date).toISOString().slice(0, 10)}`,
      createdBy: reviewerId,
    });
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
    [reviewerId, adminNotes?.trim() || null, application.id]
  );
  return rows[0];
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
      try {
        updatedApplication = await approvePendingApplication(client, application, {
          reviewerId: req.user.id,
          adminNotes: admin_notes,
        });
      } catch (err) {
        if (err.statusCode) {
          await client.query('ROLLBACK');
          return res.status(err.statusCode).json({ message: err.message });
        }
        throw err;
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves/ledger
// Full auditable transaction history behind a user's leave balance.
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaveLedger(req, res, next) {
  try {
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id, 10);
    } else if (req.user.role !== 'admin' && req.query.user_id) {
      if (parseInt(req.query.user_id, 10) !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your own leave ledger.' });
      }
    }

    const conditions = ['ll.user_id = $1'];
    const params = [targetUserId];
    if (req.query.year) {
      params.push(parseInt(req.query.year, 10));
      conditions.push(`ll.year = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ll.id, ll.user_id, ll.leave_type_id, lt.name AS leave_type_name, ll.year,
              ll.entry_type, ll.amount, ll.resulting_balance, ll.period, ll.note,
              ll.created_by, ll.created_at
       FROM leave_ledger ll
       JOIN leave_types lt ON lt.id = ll.leave_type_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ll.created_at DESC`,
      params
    );

    return res.status(200).json({ user_id: targetUserId, ledger: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves/accrual/runs
// Month-by-month attendance-bonus evaluation history, including skipped months
// (for auditability even when no balance change occurred).
// ─────────────────────────────────────────────────────────────────────────────
async function getAccrualRuns(req, res, next) {
  try {
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id, 10);
    } else if (req.user.role !== 'admin' && req.query.user_id) {
      if (parseInt(req.query.user_id, 10) !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your own accrual history.' });
      }
    }

    const { rows } = await query(
      `SELECT id, user_id, period, working_days, present_equivalent_days, attendance_pct,
              bonus_awarded, skip_reason, leave_ledger_id, processed_at
       FROM attendance_accrual_runs
       WHERE user_id = $1
       ORDER BY period DESC`,
      [targetUserId]
    );

    return res.status(200).json({ user_id: targetUserId, runs: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaves/accrual/run
// Admin only — manually (re)run the attendance-bonus accrual for a given month,
// either for one employee or every active employee. Idempotent: reuses the exact
// same evaluation path as the scheduled job, so it's safe for backfill/reprocessing.
// ─────────────────────────────────────────────────────────────────────────────
async function runAccrualManually(req, res, next) {
  try {
    const targetPeriod = req.body.period || getMostRecentlyCompletedPeriod();

    if (req.body.user_id) {
      const { rows: userRows } = await query(
        `SELECT id, date_of_joining FROM users WHERE id = $1 AND role = 'employee' AND status = 'active'`,
        [req.body.user_id]
      );
      if (!userRows.length) {
        return res.status(404).json({ message: 'Active employee not found.' });
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const result = await evaluateEmployeeForPeriod(client, {
          userId: userRows[0].id,
          dateOfJoining: userRows[0].date_of_joining
            ? new Date(userRows[0].date_of_joining).toISOString().slice(0, 10)
            : null,
          period: targetPeriod,
          createdBy: req.user.id,
        });
        await client.query('COMMIT');
        return res.status(200).json({
          period: targetPeriod,
          evaluated: 1,
          bonusesAwarded: result.bonusAwarded ? 1 : 0,
          results: [{ userId: userRows[0].id, ...result }],
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const summary = await runAccrualForPeriod(targetPeriod, { createdBy: req.user.id });
    return res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ensureUserLeaveBalances,
  calculateWorkingDays,
  getLeaveBalances,
  applyLeave,
  getLeaveApplications,
  reviewLeaveApplication,
  getLeaveLedger,
  getAccrualRuns,
  runAccrualManually,
};
