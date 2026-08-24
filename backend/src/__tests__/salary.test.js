'use strict';

/**
 * Salary Computation, Payslips & Reports API Tests (Phase 5)
 * Covers deterministic day-by-day calculations, precedence rules,
 * historical salary revisions, payslip snapshots, PDF/Excel generation, and RBAC.
 */

const request = require('supertest');

jest.mock('../db/pool', () => {
  const q = jest.fn();
  const mockClient = { query: jest.fn(), release: jest.fn() };
  return {
    query: q,
    getClient: jest.fn().mockResolvedValue(mockClient),
    pool: { query: jest.fn().mockResolvedValue({ rows: [{ status: 'active', first_login: false, password_changed_at: null }] }), end: jest.fn(), on: jest.fn() },
    _mockClient: mockClient,
  };
});

const { query, _mockClient: mockClient } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const { getApplicableMonthlySalary, calculateMonthlySalary } = require('../services/salaryService');
const app = require('../app');

const ADMIN_TOKEN     = signToken({ id: 1, role: 'admin',    employee_id: 'ADMIN001' });
const EMPLOYEE_TOKEN  = signToken({ id: 2, role: 'employee', employee_id: 'EMP001'   });
const OTHER_EMP_TOKEN = signToken({ id: 3, role: 'employee', employee_id: 'EMP002'   });

// 31000 / 31 days in August = a clean 1000/day derived rate, so expected
// totals below read the same way the old flat-rate fixture did.
const SAMPLE_EMPLOYEE = {
  id: 2,
  employee_id: 'EMP001',
  name: 'John Doe',
  designation: 'Software Engineer',
  email: 'john@example.com',
  monthly_salary: '31000.00',
  date_of_joining: '2025-01-01',
  status: 'active',
};

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

// =============================================================================
// Unit Tests: Salary Engine & Rate Resolution
// =============================================================================
describe('Salary Engine: getApplicableMonthlySalary', () => {
  test('returns current monthly salary when no salary history exists', () => {
    const salary = getApplicableMonthlySalary('2026-08-15', 31200, []);
    expect(salary).toBe(31200);
  });

  test('returns old monthly salary for dates before revision and new for dates after', () => {
    const history = [
      {
        id: 1,
        old_monthly_salary: '31000.00',
        new_monthly_salary: '31500.00',
        changed_at: '2026-08-15T10:00:00.000Z',
      },
    ];

    // Date before revision: Aug 10
    expect(getApplicableMonthlySalary('2026-08-10', 31500, history)).toBe(31000);
    // Date of revision / after revision: Aug 15
    expect(getApplicableMonthlySalary('2026-08-15', 31500, history)).toBe(31500);
    // Date after revision: Aug 20
    expect(getApplicableMonthlySalary('2026-08-20', 31500, history)).toBe(31500);
  });

  test('handles multiple revisions in historical timeline', () => {
    const history = [
      { id: 1, old_monthly_salary: '28000.00', new_monthly_salary: '31000.00', changed_at: '2026-08-05T00:00:00.000Z' },
      { id: 2, old_monthly_salary: '31000.00', new_monthly_salary: '32000.00', changed_at: '2026-08-20T00:00:00.000Z' },
    ];

    // Before first change (Aug 02) -> 28000
    expect(getApplicableMonthlySalary('2026-08-02', 32000, history)).toBe(28000);
    // Between first and second change (Aug 10) -> 31000
    expect(getApplicableMonthlySalary('2026-08-10', 32000, history)).toBe(31000);
    // After second change (Aug 25) -> 32000
    expect(getApplicableMonthlySalary('2026-08-25', 32000, history)).toBe(32000);
  });
});

// =============================================================================
// Unit Tests: calculateMonthlySalary
// =============================================================================
// All scenarios below use August 2026 (31 days, Aug 1 = 1st Saturday).
//
// Weekend policy: every Sunday + only the 2nd and 4th Saturday of each month.
// August 2026 calendar: 1=Sat(1st), 2=Sun, 8=Sat(2nd), 9=Sun, 15=Sat(3rd),
//   16=Sun, 22=Sat(4th), 23=Sun, 29=Sat(5th), 30=Sun, 31=Mon.
// Only Sundays + the 2nd/4th Saturday are weekends (Aug 2,8,9,16,22,23,30).
// Aug 1, 15, 29 (1st/3rd/5th Sat) are working days unless a holiday is set.
//
// With SAMPLE_EMPLOYEE's monthly_salary of 31000, the derived rate is a
// clean 1000/day.
//
// Pay-window model: salary only accrues between the employee's first and
// last "worked" day (present/travel/wfh/half_day) that month — everything
// outside that window is unpaid, regardless of day type. Weekends/holidays
// inside the window are paid by default (factor 1.0) unless sandwiched
// between two absences on both bounding working days.
describe('Salary Engine: calculateMonthlySalary', () => {
  // Scenario 1: the pay window itself — mirrors the reported case of an
  // employee present Aug 10–17; the window trims to exactly those days,
  // including the weekend/working-Saturday inside it, and pays nothing
  // outside it even though the rest of the month has no attendance record.
  test('Scenario 1: pay window is trimmed to [first present day, last present day]', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] }) // no salary revisions
        .mockResolvedValueOnce({ rows: [] }) // no holidays
        .mockResolvedValueOnce({ rows: [] }) // no leaves
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-10', status: 'present' }, // Mon
            { date: '2026-08-11', status: 'present' }, // Tue
            { date: '2026-08-12', status: 'present' }, // Wed
            { date: '2026-08-13', status: 'present' }, // Thu
            { date: '2026-08-14', status: 'present' }, // Fri
            { date: '2026-08-15', status: 'present' }, // Sat (3rd, working day)
            // Aug 16 (Sun) is a weekend — no attendance row needed
            { date: '2026-08-17', status: 'present' }, // Mon — last present day
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    expect(result.summary.pay_period_start).toBe('2026-08-10');
    expect(result.summary.pay_period_end).toBe('2026-08-17');
    expect(result.summary.present_days).toBe(7);
    expect(result.summary.weekend_count).toBe(1); // Aug 16, paid — neither neighbor absent
    expect(result.summary.total_days).toBe(8); // Aug 10–17 inclusive
    // 7 present days @1000 + 1 paid weekend @1000 = 8000
    expect(result.summary.net_salary).toBe(8000);

    // Days outside the window are unpaid even though they're plain calendar days.
    const aug5 = result.days.find((d) => d.date === '2026-08-05');
    expect(aug5.payable_factor).toBe(0);
    expect(aug5.status).toBe('outside_period');
    const aug20 = result.days.find((d) => d.date === '2026-08-20');
    expect(aug20.payable_factor).toBe(0);
    expect(aug20.status).toBe('outside_period');
  });

  // Scenario 2a: sandwich rule excludes a weekend flanked by absence on both sides.
  test('Scenario 2a: a weekend absent on both bounding working days is unpaid', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // no holidays
        .mockResolvedValueOnce({ rows: [] }) // no leaves
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-18', status: 'present' }, // Tue
            { date: '2026-08-19', status: 'present' }, // Wed
            { date: '2026-08-20', status: 'present' }, // Thu
            { date: '2026-08-21', status: 'absent' },  // Fri — before the weekend block
            // Aug 22 (Sat, 4th) + Aug 23 (Sun) = weekend block
            { date: '2026-08-24', status: 'absent' },  // Mon — after the weekend block
            { date: '2026-08-25', status: 'present' }, // Tue
            { date: '2026-08-26', status: 'present' }, // Wed — last present day
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    const sat = result.days.find((d) => d.date === '2026-08-22');
    const sun = result.days.find((d) => d.date === '2026-08-23');
    expect(sat.payable_factor).toBe(0);
    expect(sun.payable_factor).toBe(0);
    expect(sat.note).toMatch(/sandwiched/i);
    // present: 18,19,20,25,26 = 5 @1000; absent: 21,24 = 0; weekend 22,23 = 0
    expect(result.summary.net_salary).toBe(5000);
  });

  // Scenario 2b: the sandwich rule requires absence on BOTH bounding days —
  // one present neighbor is enough to keep the weekend paid.
  test('Scenario 2b: a weekend with only one absent neighbor stays paid', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-18', status: 'present' },
            { date: '2026-08-19', status: 'present' },
            { date: '2026-08-20', status: 'present' },
            { date: '2026-08-21', status: 'present' }, // Fri — present, not absent
            // Aug 22–23 weekend
            { date: '2026-08-24', status: 'absent' },  // Mon — absent
            { date: '2026-08-25', status: 'present' },
            { date: '2026-08-26', status: 'present' },
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    const sat = result.days.find((d) => d.date === '2026-08-22');
    expect(sat.payable_factor).toBe(1);
    // present: 18,19,20,21,25,26 = 6 @1000; weekend 22,23 paid @1000 each; absent 24 = 0
    expect(result.summary.net_salary).toBe(8000);
  });

  // Scenario 3: every status precedence (leave > attendance > absent) exercised
  // together inside one window, including a holiday that isn't sandwiched.
  test('Scenario 3: mixed statuses inside the window (present/travel/half-day/wfh/leave/absent/weekend/holiday)', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ date: '2026-08-13', name: 'Test Holiday' }], // Thursday
        })
        .mockResolvedValueOnce({
          rows: [
            { start_date: '2026-08-10', end_date: '2026-08-10', is_paid: true, leave_type_name: 'Casual Leave' },
            { start_date: '2026-08-11', end_date: '2026-08-11', is_paid: false, leave_type_name: 'Unpaid Leave' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-05', status: 'present' }, // Wed — window start
            { date: '2026-08-06', status: 'travel' },  // Thu
            { date: '2026-08-07', status: 'half_day' }, // Fri
            // Aug 8–9 weekend (paid — neighbors aren't both absent)
            // Aug 10 paid leave, Aug 11 unpaid leave (from leaveMap)
            { date: '2026-08-12', status: 'wfh' },      // Wed
            // Aug 13 holiday (Thu) — no attendance needed
            // Aug 14 (Fri) — no record at all -> absent
            { date: '2026-08-15', status: 'present' },  // Sat (3rd) — window end
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    expect(result.summary.pay_period_start).toBe('2026-08-05');
    expect(result.summary.pay_period_end).toBe('2026-08-15');
    expect(result.summary.present_days).toBe(2);
    expect(result.summary.travel_days).toBe(1);
    expect(result.summary.half_days).toBe(1);
    expect(result.summary.wfh_days).toBe(1);
    expect(result.summary.paid_leave_days).toBe(1);
    expect(result.summary.unpaid_leave_days).toBe(1);
    expect(result.summary.absent_days).toBe(1); // Aug 14, unmarked
    expect(result.summary.holiday_count).toBe(1);
    expect(result.summary.weekend_count).toBe(2);
    // 2 present(2000) + travel(1000) + half(500) + 2 weekend(2000) + paid leave(1000)
    // + unpaid leave(0) + wfh(1000) + holiday(1000) + absent(0) = 8500
    expect(result.summary.net_salary).toBe(8500);
  });

  // Scenario 4: mid-month salary revision — still resolves day-by-day inside
  // the trimmed window, and doubles as another single-side-absence check
  // (Aug 15 is absent but Aug 17 is present, so the Aug 16 weekend stays paid).
  test('Scenario 4: mid-month revision on Aug 16 (1000/day -> 2000/day) inside a trimmed window', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ ...SAMPLE_EMPLOYEE, monthly_salary: '62000.00' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, old_monthly_salary: '31000.00', new_monthly_salary: '62000.00', changed_at: '2026-08-16T00:00:00.000Z' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-14', status: 'present' }, // Fri, before revision -> 1000/day
            // Aug 15 (Sat, 3rd, working day) — no record -> absent
            // Aug 16 (Sun) weekend
            { date: '2026-08-17', status: 'present' }, // Mon, after revision -> 2000/day
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    expect(result.summary.pay_period_start).toBe('2026-08-14');
    expect(result.summary.pay_period_end).toBe('2026-08-17');
    expect(result.summary.absent_days).toBe(1); // Aug 15
    const sun = result.days.find((d) => d.date === '2026-08-16');
    expect(sun.payable_factor).toBe(1); // Aug 17 neighbor is present, so not sandwiched
    expect(sun.rate).toBe(2000); // revision already in effect
    // Aug14 present@1000=1000, Aug15 absent=0, Aug16 weekend@2000=2000, Aug17 present@2000=2000
    expect(result.summary.net_salary).toBe(5000);
  });

  // Scenario 5: approved leave alone, with zero attendance records, never
  // establishes a pay window (per the "worked days only" bounding rule) —
  // the whole month pays 0, including the holiday/weekend inside the leave range.
  test('Scenario 5: no attendance at all this month -> no pay window, net salary is 0', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-08-14', name: 'Company Foundation Day' }] })
        .mockResolvedValueOnce({
          rows: [{ start_date: '2026-08-13', end_date: '2026-08-17', is_paid: true, leave_type_name: 'Paid Leave' }],
        })
        .mockResolvedValueOnce({ rows: [] }), // no attendance rows at all
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    expect(result.summary.pay_period_start).toBeNull();
    expect(result.summary.pay_period_end).toBeNull();
    expect(result.summary.total_days).toBe(0);
    expect(result.summary.paid_leave_days).toBe(0);
    expect(result.summary.holiday_count).toBe(0);
    expect(result.summary.net_salary).toBe(0);
  });

  // Scenario 6: a future-dated attendance row (the known admin-override gap
  // that accepts dates with no validation) must not extend the window or
  // get paid — the engine never looks past asOfDate.
  test('Scenario 6: attendance dated after asOfDate is ignored for the window and never paid', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-05', status: 'present' },
            { date: '2026-08-20', status: 'present' }, // beyond asOfDate below
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-10');

    expect(result.summary.pay_period_start).toBe('2026-08-05');
    expect(result.summary.pay_period_end).toBe('2026-08-05');
    expect(result.summary.net_salary).toBe(1000);

    const aug20 = result.days.find((d) => d.date === '2026-08-20');
    expect(aug20.payable_factor).toBe(0);
    expect(aug20.status).toBe('outside_period');
  });

  // Scenario 7: deduction math — PF + Professional Tax + TDS are actually
  // subtracted from the attendance-based gross, and net salary floors at 0
  // rather than going negative when deductions exceed a trimmed window's gross.
  test('Scenario 7: PF/Professional Tax/TDS are subtracted from gross to produce net salary', async () => {
    const employeeWithDeductions = {
      ...SAMPLE_EMPLOYEE,
      pf_deduction: '1800.00',
      professional_tax: '200.00',
      tds: '500.00',
    };
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [employeeWithDeductions] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-10', status: 'present' },
            { date: '2026-08-11', status: 'present' },
            { date: '2026-08-12', status: 'present' },
            { date: '2026-08-13', status: 'present' },
            { date: '2026-08-14', status: 'present' }, // 5 present days, no weekend in window
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8, '2026-08-31');

    expect(result.summary.gross_salary).toBe(5000);
    expect(result.summary.total_deductions).toBe(2500);
    expect(result.summary.net_salary).toBe(2500); // 5000 - 2500

    // A single present day (1000 gross) with the same 2500 deductions must
    // floor at 0, not go negative.
    const mockDbShort = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [employeeWithDeductions] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-08-10', status: 'present' }] }),
    };
    const shortResult = await calculateMonthlySalary(mockDbShort, 2, 2026, 8, '2026-08-31');
    expect(shortResult.summary.gross_salary).toBe(1000);
    expect(shortResult.summary.net_salary).toBe(0);
  });
});

// =============================================================================
// API Tests: GET /api/reports/salary/compute
// =============================================================================
describe('GET /api/reports/salary/compute', () => {
  test('employee can preview own calculated salary', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', status: 'present' }],
      });

    const res = await request(app)
      .get('/api/reports/salary/compute?year=2026&month=8&as_of_date=2026-08-31')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.present_days).toBe(1);
    // Pay window is just that one present day (Aug 03) — nothing outside it accrues.
    expect(res.body.summary.net_salary).toBe(1000);
  });

  test('employee cannot compute salary for another employee', async () => {
    const res = await request(app)
      .get('/api/reports/salary/compute?year=2026&month=8&user_id=3')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('admin can compute salary for any employee', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/reports/salary/compute?year=2026&month=8&user_id=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.employee.id).toBe(2);
  });
});

// =============================================================================
// API Tests: GET /api/reports/salary/compute/download (live/provisional PDF)
// =============================================================================
describe('GET /api/reports/salary/compute/download', () => {
  test('employee downloads own provisional PDF from the live calculation', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', status: 'present' }],
      })
      // getPayslipLeaveSummary: leave types, balances, earned, taken
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total: '4' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const res = await request(app)
      .get('/api/reports/salary/compute/download?year=2026&month=8&as_of_date=2026-08-31')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=.*Provisional/);
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  test('employee cannot download another employee\'s provisional PDF', async () => {
    const res = await request(app)
      .get('/api/reports/salary/compute/download?year=2026&month=8&user_id=3')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('admin downloads provisional PDF for any employee', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const res = await request(app)
      .get('/api/reports/salary/compute/download?year=2026&month=8&user_id=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });
});

// =============================================================================
// API Tests: POST /api/reports/payslips/generate
// =============================================================================
describe('POST /api/reports/payslips/generate', () => {
  test('admin generates and saves monthly payslip snapshot', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // calculation queries
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', status: 'present' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 50,
            user_id: 2,
            year: 2026,
            month: 8,
            working_days: 21,
            net_salary: '1000.00',
            generated_at: new Date().toISOString(),
          },
        ],
      }); // INSERT payslips

    const res = await request(app)
      .post('/api/reports/payslips/generate')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ user_id: 2, year: 2026, month: 8 });

    expect(res.status).toBe(201);
    expect(res.body.payslip.net_salary).toBe('1000.00');
  });

  test('employee cannot generate payslips', async () => {
    const res = await request(app)
      .post('/api/reports/payslips/generate')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ user_id: 2, year: 2026, month: 8 });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// API Tests: GET /api/reports/payslips & GET /api/reports/payslips/:id
// =============================================================================
describe('GET /api/reports/payslips', () => {
  test('employee lists own payslips', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 50,
          user_id: 2,
          month: 8,
          year: 2026,
          net_salary: '1000.00',
          employee_name: 'John Doe',
        },
      ],
    });

    const res = await request(app)
      .get('/api/reports/payslips')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.payslips).toHaveLength(1);
  });

  test('employee views single payslip by ID', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 50,
          user_id: 2,
          month: 8,
          year: 2026,
          net_salary: '1000.00',
          employee_name: 'John Doe',
          breakdown: '[]',
        },
      ],
    });

    const res = await request(app)
      .get('/api/reports/payslips/50')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.payslip.id).toBe(50);
  });

  test('employee forbidden from viewing other employee payslip', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 50,
          user_id: 3, // owned by employee 3
          month: 8,
          year: 2026,
        },
      ],
    });

    const res = await request(app)
      .get('/api/reports/payslips/50')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`); // user 2

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// API Tests: GET /api/reports/payslips/:id/download (PDF)
// =============================================================================
describe('GET /api/reports/payslips/:id/download', () => {
  test('downloads PDF payslip successfully', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 50,
          user_id: 2,
          month: 8,
          year: 2026,
          working_days: 21,
          present_days: 20,
          half_days: 0,
          travel_days: 0,
          wfh_days: 0,
          paid_leave_days: 1,
          unpaid_leave_days: 0,
          absent_days: 0,
          holiday_count: 1,
          weekend_count: 9,
          monthly_salary: '31000.00',
          per_day_salary: '1000.00',
          net_salary: '21000.00',
          breakdown: '[]',
          employee_name: 'John Doe',
          employee_id: 'EMP001',
          designation: 'Software Engineer',
          date_of_joining: '2025-01-01',
          pan: 'ABCDE1234F',
          bank_name: 'HDFC Bank',
          bank_account_no: '1234567890',
          basic: '15000.00',
          hra: '7500.00',
          education_allowance: '1000.00',
          conveyance: '1000.00',
          professional_development: '500.00',
          other_allowance: '500.00',
          lta: '1000.00',
          employer_pf: '1800.00',
          bonus: '0.00',
          pf_deduction: '1800.00',
          professional_tax: '200.00',
          tds: '0.00',
        },
      ],
    });
    // getPayslipLeaveSummary: leave types, balances, earned, taken
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total: '4' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const res = await request(app)
      .get('/api/reports/payslips/50/download')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(res.body).toBeInstanceOf(Buffer);
  });
});

// =============================================================================
// API Tests: GET /api/reports/consolidated/excel (Excel)
// =============================================================================
describe('GET /api/reports/consolidated/excel', () => {
  test('admin downloads consolidated Excel report', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // employees list
      .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // calc user
      .mockResolvedValueOnce({ rows: [] }) // calc history
      .mockResolvedValueOnce({ rows: [] }) // calc holidays
      .mockResolvedValueOnce({ rows: [] }) // calc leaves
      .mockResolvedValueOnce({ rows: [] }); // calc attendance

    const res = await request(app)
      .get('/api/reports/consolidated/excel?year=2026&month=8')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(res.status).toBe(200);
  });

  test('employee cannot download consolidated Excel report', async () => {
    const res = await request(app)
      .get('/api/reports/consolidated/excel?year=2026&month=8')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });
});
