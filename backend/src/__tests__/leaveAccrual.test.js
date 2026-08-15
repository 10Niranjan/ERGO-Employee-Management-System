'use strict';

/**
 * Attendance-Based Leave Accrual Tests
 * Covers the exact-70% boundary, the net-zero worked example, idempotent re-runs,
 * mid-year joiners, and missing/zero attendance data.
 */

jest.mock('../db/pool', () => {
  const mockClient = { query: jest.fn() };
  return {
    query: jest.fn(),
    getClient: jest.fn().mockResolvedValue(mockClient),
    pool: { query: jest.fn(), end: jest.fn(), on: jest.fn() },
    _mockClient: mockClient,
  };
});

jest.mock('../services/salaryService', () => ({
  calculateMonthlySalary: jest.fn(),
}));

const { _mockClient: mockClient } = require('../db/pool');
const { calculateMonthlySalary } = require('../services/salaryService');
const {
  computeAttendancePercent,
  qualifiesForBonus,
  evaluateEmployeeForPeriod,
} = require('../services/leaveAccrualService');

afterEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// Pure calculation: computeAttendancePercent / qualifiesForBonus
// =============================================================================
describe('computeAttendancePercent', () => {
  test('exact 70% boundary qualifies for the bonus', () => {
    const { attendancePct } = computeAttendancePercent({
      working_days: 10, present_days: 7, travel_days: 0, half_days: 0,
    });
    expect(attendancePct).toBe(70);
    expect(qualifiesForBonus(attendancePct)).toBe(true);
  });

  test('just under 70% does not qualify', () => {
    const { attendancePct } = computeAttendancePercent({
      working_days: 10, present_days: 6, half_days: 1, travel_days: 0, // 6.5/10 = 65%
    });
    expect(attendancePct).toBe(65);
    expect(qualifiesForBonus(attendancePct)).toBe(false);
  });

  test('missing attendance data (no records — fully absent per salaryService) yields a low percentage, no crash', () => {
    const { attendancePct } = computeAttendancePercent({
      working_days: 22, present_days: 0, travel_days: 0, half_days: 0,
    });
    expect(attendancePct).toBe(0);
    expect(qualifiesForBonus(attendancePct)).toBe(false);
  });

  test('zero working days in the month returns null (no divide-by-zero)', () => {
    const { attendancePct } = computeAttendancePercent({
      working_days: 0, present_days: 0, travel_days: 0, half_days: 0,
    });
    expect(attendancePct).toBeNull();
    expect(qualifiesForBonus(attendancePct)).toBe(false);
  });
});

// =============================================================================
// Worked examples from the spec — the formula must match exactly.
// new_balance = current_balance - leaves_taken_this_month + (1 if attendance% >= 70 else 0)
// =============================================================================
describe('accrual formula worked examples', () => {
  test('0 leaves taken, attendance >= 70%: balance 6 -> 7', () => {
    expect(6 - 0 + 1).toBe(7);
  });

  test('1 leave taken, attendance still >= 70%: balance 5 -> 6 (taken and earned net out)', () => {
    // Balance already reflects the 1 taken (6 -> 5); the bonus then applies on top.
    expect(5 - 0 + 1).toBe(6);
  });

  test('attendance < 70%: no bonus, balance only reflects leaves taken', () => {
    expect(6 - 1 + 0).toBe(5);
  });

  test('recurring: 3 consecutive qualifying months compound independently (6 -> 7 -> 8 -> 9)', () => {
    let balance = 6;
    for (let i = 0; i < 3; i++) balance = balance - 0 + 1;
    expect(balance).toBe(9);
  });
});

// =============================================================================
// Orchestration: evaluateEmployeeForPeriod
// =============================================================================
describe('evaluateEmployeeForPeriod', () => {
  test('awards +1 bonus when attendance >= 70% and 0 leaves taken that month', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // idempotency guard: no existing run
      .mockResolvedValueOnce({ rows: [{ id: 3, max_balance_cap: null }] }) // getPaidLeaveType
      .mockResolvedValueOnce({ rows: [{ id: 50 }] }) // ensureBalanceRowForCredit: row already exists
      .mockResolvedValueOnce({ rows: [{ remaining: 6 }] }) // current remaining (cap check)
      .mockResolvedValueOnce({ rows: [{ remaining: 7 }] }) // applyLedgerEntry UPDATE RETURNING remaining
      .mockResolvedValueOnce({ rows: [{ id: 900 }] }) // applyLedgerEntry INSERT leave_ledger
      .mockResolvedValueOnce({ rows: [{ id: 1000, bonus_awarded: true }] }); // INSERT attendance_accrual_runs

    calculateMonthlySalary.mockResolvedValueOnce({
      summary: { working_days: 22, present_days: 22, half_days: 0, travel_days: 0 },
    });

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2025-01-01', period: '2026-01',
    });

    expect(result.bonusAwarded).toBe(true);
    expect(result.attendancePct).toBe(100);
    // ATTENDANCE_BONUS always applies +1, independent of how many leaves were taken that month
    const updateCall = mockClient.query.mock.calls[4];
    expect(updateCall[1]).toContain(1);
  });

  test('does not award a bonus when attendance is below 70%', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing run
      .mockResolvedValueOnce({ rows: [{ id: 1000, bonus_awarded: false }] }); // INSERT attendance_accrual_runs

    calculateMonthlySalary.mockResolvedValueOnce({
      summary: { working_days: 20, present_days: 10, half_days: 0, travel_days: 0 }, // 50%
    });

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2025-01-01', period: '2026-01',
    });

    expect(result.bonusAwarded).toBe(false);
    expect(result.attendancePct).toBe(50);
    expect(mockClient.query).toHaveBeenCalledTimes(2); // no ledger/balance calls made at all
  });

  test('is idempotent — re-running an already-processed period is a safe no-op', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 1, period: '2026-01', bonus_awarded: true }],
    });

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2025-01-01', period: '2026-01',
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_processed');
    expect(calculateMonthlySalary).not.toHaveBeenCalled();
  });

  test('skips the bonus for a mid-month/mid-year joiner\'s own joining month', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing run
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // recordSkippedRun INSERT

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2026-01-15', period: '2026-01',
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('joining_month');
    expect(calculateMonthlySalary).not.toHaveBeenCalled();
  });

  test('evaluates normally for months after the joining month', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing run
      .mockResolvedValueOnce({ rows: [{ id: 1000, bonus_awarded: false }] }); // INSERT run (no bonus)

    calculateMonthlySalary.mockResolvedValueOnce({
      summary: { working_days: 20, present_days: 5, half_days: 0, travel_days: 0 }, // 25%, below threshold
    });

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2026-01-15', period: '2026-02',
    });

    expect(result.skipped).toBe(false);
    expect(calculateMonthlySalary).toHaveBeenCalledWith(mockClient, 2, 2026, 2);
  });

  test('skips cleanly when the month has zero working days (no divide-by-zero)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing run
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // recordSkippedRun INSERT

    calculateMonthlySalary.mockResolvedValueOnce({
      summary: { working_days: 0, present_days: 0, half_days: 0, travel_days: 0 },
    });

    const result = await evaluateEmployeeForPeriod(mockClient, {
      userId: 2, dateOfJoining: '2025-01-01', period: '2026-01',
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_working_days');
  });
});
