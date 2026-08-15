'use strict';

/**
 * Attendance-based leave accrual engine.
 *
 * Rule: every month-end, if an employee's attendance for the month just
 * completed was >= ATTENDANCE_BONUS_THRESHOLD, their paid-leave balance is
 * credited +1, effective the 1st of the following month. Independently
 * re-evaluated every month, with no memory of prior months.
 *
 * new_balance = current_balance - leaves_taken_this_month + (1 if attendance% >= threshold else 0)
 *
 * Leave taken is already deducted from `used` at approval time (see
 * leaveController.reviewLeaveApplication) — this engine only ever adds the
 * +1 bonus to `allotted` when earned, so the two adjustments net against
 * each other in the existing `remaining` (allotted - used) column. No
 * double-subtraction.
 */

const { query, getClient } = require('../db/pool');
const { calculateMonthlySalary } = require('./salaryService');
const { getNextPeriod, getMostRecentlyCompletedPeriod } = require('../utils/time');

const ATTENDANCE_BONUS_THRESHOLD = 70;
const DEFAULT_BASE_QUOTA = 6;
const PAID_LEAVE_TYPE_NAME = 'Paid Leave';

// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation helpers — no DB access, fully unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attendance % = (present + travel + 0.5*half-day) / working days in the month, excluding
 * weekends/holidays from the denominator (mirrors the existing payroll day-categorization
 * in salaryService — approved leave, whether paid or unpaid, does not count as "present").
 * Returns null when there were no working days to evaluate (can't compute a meaningful %).
 */
function computeAttendancePercent(summary) {
  const workingDays = summary.working_days || 0;
  if (workingDays === 0) return { presentEquivalentDays: 0, attendancePct: null };

  const presentEquivalentDays =
    summary.present_days + summary.travel_days + 0.5 * summary.half_days;
  const attendancePct = Math.round((presentEquivalentDays / workingDays) * 10000) / 100;
  return { presentEquivalentDays, attendancePct };
}

/** Whether a given attendance % clears the bonus threshold. */
function qualifiesForBonus(attendancePct) {
  return attendancePct !== null && attendancePct >= ATTENDANCE_BONUS_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a delta to an EXISTING leave_balances row and writes the matching ledger entry
 * in the same transaction. LEAVE_TAKEN mutates `used`; INITIAL_ALLOCATION and
 * ATTENDANCE_BONUS mutate `allotted`.
 */
async function applyLedgerEntry(client, {
  userId, leaveTypeId, year, entryType, amount, period = null, note = null, createdBy = null,
}) {
  const column = entryType === 'LEAVE_TAKEN' ? 'used' : 'allotted';
  const { rows } = await client.query(
    `UPDATE leave_balances SET ${column} = ${column} + $1, updated_at = NOW()
     WHERE user_id = $2 AND leave_type_id = $3 AND year = $4
     RETURNING remaining`,
    [amount, userId, leaveTypeId, year]
  );
  if (!rows.length) {
    throw new Error(`leave_balances row not found (user ${userId}, leave_type ${leaveTypeId}, year ${year}).`);
  }

  const { rows: ledgerRows } = await client.query(
    `INSERT INTO leave_ledger
       (user_id, leave_type_id, year, entry_type, amount, resulting_balance, period, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [userId, leaveTypeId, year, entryType, amount, rows[0].remaining, period, note, createdBy]
  );
  return ledgerRows[0];
}

/** Records an INITIAL_ALLOCATION ledger entry for a freshly-created leave_balances row. */
async function recordInitialAllocation(client, { userId, leaveTypeId, year, allotted, note = null, createdBy = null }) {
  const { rows } = await client.query(
    `INSERT INTO leave_ledger
       (user_id, leave_type_id, year, entry_type, amount, resulting_balance, note, created_by)
     VALUES ($1, $2, $3, 'INITIAL_ALLOCATION', $4, $4, $5, $6)
     RETURNING *`,
    [userId, leaveTypeId, year, allotted, note, createdBy]
  );
  return rows[0];
}

async function getPaidLeaveType(client) {
  const { rows } = await client.query(
    `SELECT id, max_balance_cap FROM leave_types WHERE name = $1 AND is_active = TRUE LIMIT 1`,
    [PAID_LEAVE_TYPE_NAME]
  );
  if (!rows.length) throw new Error(`Active '${PAID_LEAVE_TYPE_NAME}' leave type not found.`);
  return rows[0];
}

/**
 * The employee's originally-planned annual allocation for a year (sum of INITIAL_ALLOCATION
 * ledger entries), as distinct from their current allotted (which may include bonuses).
 * Used to re-baseline the following year rather than hardcoding everyone to 6.
 */
async function getBaseQuotaForYear(client, userId, leaveTypeId, year) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS base FROM leave_ledger
     WHERE user_id = $1 AND leave_type_id = $2 AND year = $3 AND entry_type = 'INITIAL_ALLOCATION'`,
    [userId, leaveTypeId, year]
  );
  const base = parseInt(rows[0].base, 10);
  return base > 0 ? base : DEFAULT_BASE_QUOTA;
}

/**
 * Ensures a leave_balances row exists for (userId, leaveTypeId, creditYear). No-op if it
 * already does (the common case — the year's row is normally created at onboarding or lazily
 * by ensureUserLeaveBalances). Only does real work when crediting into a year that has no row
 * yet, i.e. a December bonus crediting January 1st of a new year: carries forward the prior
 * year's unused balance on top of a fresh base allocation.
 *
 * ASSUMPTION (flagged per spec): balances carry forward across years, re-baselined with a
 * fresh allocation added — NOT a hard reset to the base quota. This is an explicit product
 * decision the existing schema previously assumed the opposite of (see migration 003's
 * original "no carry-forward" comment); confirm this is what you want before relying on it
 * across a real Dec→Jan boundary.
 */
async function ensureBalanceRowForCredit(client, userId, leaveTypeId, creditYear, createdBy = null) {
  const { rows: existing } = await client.query(
    'SELECT id FROM leave_balances WHERE user_id = $1 AND leave_type_id = $2 AND year = $3',
    [userId, leaveTypeId, creditYear]
  );
  if (existing.length) return;

  const { rows: prevRows } = await client.query(
    'SELECT remaining FROM leave_balances WHERE user_id = $1 AND leave_type_id = $2 AND year = $3',
    [userId, leaveTypeId, creditYear - 1]
  );
  const carryForward = prevRows.length ? Math.max(0, prevRows[0].remaining) : 0;
  const baseQuota = prevRows.length
    ? await getBaseQuotaForYear(client, userId, leaveTypeId, creditYear - 1)
    : DEFAULT_BASE_QUOTA;
  const allotted = baseQuota + carryForward;

  const { rows: inserted } = await client.query(
    `INSERT INTO leave_balances (user_id, leave_type_id, year, allotted, used)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (user_id, leave_type_id, year) DO NOTHING
     RETURNING id`,
    [userId, leaveTypeId, creditYear, allotted]
  );
  if (inserted.length) {
    await recordInitialAllocation(client, {
      userId, leaveTypeId, year: creditYear, allotted,
      note: carryForward > 0
        ? `Base ${baseQuota} + carried forward ${carryForward} from ${creditYear - 1}`
        : `Base allocation ${baseQuota}`,
      createdBy,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core per-employee, per-period evaluation — idempotent.
// ─────────────────────────────────────────────────────────────────────────────

async function recordSkippedRun(client, userId, period, skipReason, summary = null) {
  const { rows } = await client.query(
    `INSERT INTO attendance_accrual_runs
       (user_id, period, working_days, present_equivalent_days, attendance_pct, bonus_awarded, skip_reason)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6)
     ON CONFLICT (user_id, period) DO NOTHING
     RETURNING *`,
    [
      userId, period,
      summary ? summary.working_days : null,
      summary ? summary.present_days + summary.travel_days + 0.5 * summary.half_days : null,
      null,
      skipReason,
    ]
  );
  return { skipped: true, reason: skipReason, run: rows[0] || null };
}

/**
 * Evaluates one employee's attendance for `period` ('YYYY-MM') and, if qualifying, credits
 * the +1 bonus effective the 1st of the following month. Idempotent: re-running for a period
 * already processed is a safe no-op (guarded by the attendance_accrual_runs unique constraint).
 */
async function evaluateEmployeeForPeriod(client, { userId, dateOfJoining, period, createdBy = null }) {
  const { rows: existingRuns } = await client.query(
    'SELECT * FROM attendance_accrual_runs WHERE user_id = $1 AND period = $2',
    [userId, period]
  );
  if (existingRuns.length) {
    return { skipped: true, reason: 'already_processed', run: existingRuns[0] };
  }

  // Mid-month/mid-year joiners: skip the bonus for their joining month (default per spec).
  if (dateOfJoining) {
    const joinPeriod = String(dateOfJoining).slice(0, 7);
    if (joinPeriod >= period) {
      return recordSkippedRun(client, userId, period, 'joining_month');
    }
  }

  const [year, month] = period.split('-').map(Number);
  const { summary } = await calculateMonthlySalary(client, userId, year, month);

  if (!summary.working_days) {
    return recordSkippedRun(client, userId, period, 'no_working_days', summary);
  }

  const { presentEquivalentDays, attendancePct } = computeAttendancePercent(summary);
  const bonusQualifies = qualifiesForBonus(attendancePct);

  let ledgerEntry = null;
  let bonusAwarded = false;

  if (bonusQualifies) {
    const paidLeaveType = await getPaidLeaveType(client);
    const creditPeriod = getNextPeriod(period);
    const creditYear = parseInt(creditPeriod.slice(0, 4), 10);

    await ensureBalanceRowForCredit(client, userId, paidLeaveType.id, creditYear, createdBy);

    const { rows: balRows } = await client.query(
      'SELECT remaining FROM leave_balances WHERE user_id = $1 AND leave_type_id = $2 AND year = $3',
      [userId, paidLeaveType.id, creditYear]
    );
    const currentRemaining = balRows.length ? balRows[0].remaining : 0;
    const capped = paidLeaveType.max_balance_cap != null && currentRemaining >= paidLeaveType.max_balance_cap;

    if (capped) {
      const skipped = await recordSkippedRun(client, userId, period, 'balance_capped', summary);
      return { ...skipped, attendancePct, presentEquivalentDays };
    }

    ledgerEntry = await applyLedgerEntry(client, {
      userId,
      leaveTypeId: paidLeaveType.id,
      year: creditYear,
      entryType: 'ATTENDANCE_BONUS',
      amount: 1,
      period,
      note: `Attendance ${attendancePct}% in ${period} (>= ${ATTENDANCE_BONUS_THRESHOLD}% threshold)`,
      createdBy,
    });
    bonusAwarded = true;
  }

  const { rows: runRows } = await client.query(
    `INSERT INTO attendance_accrual_runs
       (user_id, period, working_days, present_equivalent_days, attendance_pct, bonus_awarded, leave_ledger_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, period, summary.working_days, presentEquivalentDays, attendancePct, bonusAwarded, ledgerEntry ? ledgerEntry.id : null]
  );

  return { skipped: false, bonusAwarded, attendancePct, presentEquivalentDays, run: runRows[0], ledgerEntry };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch orchestration — used by both the scheduled job and the manual admin trigger.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the accrual evaluation for `period` ('YYYY-MM') across every active employee.
 * Reused identically by the cron job, the server-startup catch-up, and the manual
 * admin "run accrual for month X" endpoint — one code path, three callers.
 */
async function runAccrualForPeriod(period, { createdBy = null } = {}) {
  const { rows: employees } = await query(
    `SELECT id, date_of_joining FROM users WHERE role = 'employee' AND status = 'active'`
  );

  const results = [];
  for (const emp of employees) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await evaluateEmployeeForPeriod(client, {
        userId: emp.id,
        dateOfJoining: emp.date_of_joining ? new Date(emp.date_of_joining).toISOString().slice(0, 10) : null,
        period,
        createdBy,
      });
      await client.query('COMMIT');
      results.push({ userId: emp.id, ...result });
    } catch (err) {
      await client.query('ROLLBACK');
      results.push({ userId: emp.id, skipped: true, reason: 'error', error: err.message });
    } finally {
      client.release();
    }
  }

  return {
    period,
    evaluated: results.length,
    bonusesAwarded: results.filter((r) => r.bonusAwarded).length,
    results,
  };
}

/** Runs accrual for the most recently completed month — the normal recurring job body. */
async function runAccrualForMostRecentlyCompletedPeriod(opts = {}) {
  return runAccrualForPeriod(getMostRecentlyCompletedPeriod(), opts);
}

module.exports = {
  ATTENDANCE_BONUS_THRESHOLD,
  DEFAULT_BASE_QUOTA,
  PAID_LEAVE_TYPE_NAME,
  computeAttendancePercent,
  qualifiesForBonus,
  applyLedgerEntry,
  recordInitialAllocation,
  getPaidLeaveType,
  getBaseQuotaForYear,
  ensureBalanceRowForCredit,
  evaluateEmployeeForPeriod,
  runAccrualForPeriod,
  runAccrualForMostRecentlyCompletedPeriod,
};
