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
// All scenarios below use August 2026 (31 days, Aug 1 = Saturday), so
// weekends fall on 1,2,8,9,15,16,22,23,29,30 — 10 weekend days unless one
// coincides with a holiday, in which case the holiday takes precedence
// (matches the engine's classification order) and isn't double-counted.
// With SAMPLE_EMPLOYEE's monthly_salary of 31000, the derived rate is a
// clean 1000/day, and — per the confirmed formula — weekends and holidays
// are now paid days, so every scenario's expected total includes them.
describe('Salary Engine: calculateMonthlySalary', () => {
  test('calculates salary with mixed statuses (Present, Travel, Half-Day, Paid Leave, Unpaid Leave, Absent, Weekend, Holiday)', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // 1. user
        .mockResolvedValueOnce({ rows: [] }) // 2. salary history
        .mockResolvedValueOnce({
          rows: [{ date: '2026-08-15', name: 'Independence Day' }],
        }) // 4. holidays
        .mockResolvedValueOnce({
          rows: [
            {
              start_date: '2026-08-03',
              end_date: '2026-08-03',
              is_paid: true,
              leave_type_name: 'Casual Leave',
            },
            {
              start_date: '2026-08-04',
              end_date: '2026-08-04',
              is_paid: false,
              leave_type_name: 'Unpaid Leave',
            },
          ],
        }) // 5. approved leaves
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-05', status: 'present' },
            { date: '2026-08-06', status: 'travel' },
            { date: '2026-08-07', status: 'half_day' },
            { date: '2026-08-10', status: 'absent' },
          ],
        }), // 6. attendance
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8);

    expect(result.summary.monthly_salary).toBe(31000);
    expect(result.summary.per_day_salary).toBe(1000); // derived: 31000 / 31 days
    expect(result.summary.present_days).toBe(1); // Aug 05 (1000)
    expect(result.summary.travel_days).toBe(1); // Aug 06 (1000)
    expect(result.summary.half_days).toBe(1); // Aug 07 (500)
    expect(result.summary.paid_leave_days).toBe(1); // Aug 03 (1000)
    expect(result.summary.unpaid_leave_days).toBe(1); // Aug 04 (0)
    expect(result.summary.holiday_count).toBe(1); // Aug 15 — also a Saturday, holiday wins

    // 9 weekend days (Aug 15 reclassified as holiday, not double-counted) @1000 = 9000
    // + holiday 1000 + paid leave 1000 + present 1000 + travel 1000 + half-day 500
    // + unpaid leave 0 + 15 unmarked-absent working days @ 0
    expect(result.summary.net_salary).toBe(13500);
  });

  // Scenario A: 8 Present, 1 Half-Day, 1 Unpaid Leave (with remaining 11 working days absent)
  test('Scenario A: 8 Present (100%), 1 Half-Day (50%), 1 Unpaid Leave (0%)', async () => {
    const attendanceRecords = [];
    // 8 present days
    for (let d = 3; d <= 12; d++) {
      if (d !== 8 && d !== 9) { // skip weekend
        attendanceRecords.push({ date: `2026-08-${String(d).padStart(2, '0')}`, status: 'present' });
      }
    }
    // 1 half day
    attendanceRecords.push({ date: '2026-08-13', status: 'half_day' });

    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // 1000/day
        .mockResolvedValueOnce({ rows: [] }) // no salary revisions
        .mockResolvedValueOnce({ rows: [] }) // no holidays
        .mockResolvedValueOnce({
          rows: [
            {
              start_date: '2026-08-14',
              end_date: '2026-08-14',
              is_paid: false,
              leave_type_name: 'Unpaid Leave',
            },
          ],
        }) // 1 unpaid leave
        .mockResolvedValueOnce({ rows: attendanceRecords }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8);
    expect(result.summary.present_days).toBe(8);
    expect(result.summary.half_days).toBe(1);
    expect(result.summary.unpaid_leave_days).toBe(1);
    // 10 weekend days @1000 = 10000, + (8 * 1000) present + (1 * 500) half-day
    // + (1 * 0) unpaid + 11 unmarked-absent working days @ 0
    expect(result.summary.net_salary).toBe(18500);
  });

  // Scenario B: 6 Present, 1 Half-Day, 1 Travel, 1 Paid Leave, 1 Unpaid Leave
  test('Scenario B: 6 Present, 1 Half-Day, 1 Travel, 1 Paid Leave, 1 Unpaid Leave', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] }) // 1000/day
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { start_date: '2026-08-03', end_date: '2026-08-03', is_paid: true, leave_type_name: 'Paid Leave' },
            { start_date: '2026-08-04', end_date: '2026-08-04', is_paid: false, leave_type_name: 'Unpaid Leave' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-05', status: 'present' },
            { date: '2026-08-06', status: 'present' },
            { date: '2026-08-07', status: 'present' },
            { date: '2026-08-10', status: 'present' },
            { date: '2026-08-11', status: 'present' },
            { date: '2026-08-12', status: 'present' },
            { date: '2026-08-13', status: 'travel' },
            { date: '2026-08-14', status: 'half_day' },
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8);
    expect(result.summary.present_days).toBe(6);
    expect(result.summary.travel_days).toBe(1);
    expect(result.summary.half_days).toBe(1);
    expect(result.summary.paid_leave_days).toBe(1);
    expect(result.summary.unpaid_leave_days).toBe(1);
    // 10 weekend days @1000 = 10000, + (6*1000) present + (1*1000) travel
    // + (0.5*1000) half-day + (1*1000) paid leave + 0 unpaid + 11 unmarked @ 0
    expect(result.summary.net_salary).toBe(18500);
  });

  // Scenario C: Mid-Month Salary Revision — monthly figures chosen so the
  // derived rate is a clean 1000/day before and 2000/day after (31000 and
  // 62000, both /31).
  test('Scenario C: Mid-Month Salary Revision on Aug 16 from 31000 to 62000 (1000/day -> 2000/day)', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ ...SAMPLE_EMPLOYEE, monthly_salary: '62000.00' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              old_monthly_salary: '31000.00',
              new_monthly_salary: '62000.00',
              changed_at: '2026-08-16T00:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // no holidays
        .mockResolvedValueOnce({ rows: [] }) // no leaves
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-08-14', status: 'present' }, // before revision -> 1000/day
            { date: '2026-08-17', status: 'present' }, // after revision -> 2000/day
          ],
        }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8);
    expect(result.summary.present_days).toBe(2);
    // Present: Aug14 (1000) + Aug17 (2000) = 3000
    // Weekends (10 days total) split by the revision boundary: Aug 1,2,8,9,15
    // (before, @1000) = 5000; Aug 16,22,23,29,30 (on/after, @2000) = 10000
    // Total = 3000 + 5000 + 10000 = 18000
    expect(result.summary.net_salary).toBe(18000);
  });

  // Scenario D: Weekend + Company Holiday + Approved Leave
  test('Scenario D: paid leave only "consumes" working days — the holiday and weekend inside its range are already paid on their own', async () => {
    const mockDb = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [SAMPLE_EMPLOYEE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ date: '2026-08-14', name: 'Company Foundation Day' }], // Friday holiday
        })
        .mockResolvedValueOnce({
          rows: [
            {
              start_date: '2026-08-13', // Thursday (paid leave)
              end_date: '2026-08-17',   // Monday (paid leave) - range spans Fri(Hol), Sat(Wknd), Sun(Wknd)
              is_paid: true,
              leave_type_name: 'Paid Leave',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const result = await calculateMonthlySalary(mockDb, 2, 2026, 8);
    expect(result.summary.holiday_count).toBe(1); // Aug 14 is holiday
    // Working days in leave range: Aug 13 (Thu) & Aug 17 (Mon) = 2 paid leave days
    expect(result.summary.paid_leave_days).toBe(2);
    // 10 weekend days @1000 = 10000, + 1 holiday @1000 = 1000, + 2 paid-leave
    // days @1000 = 2000, + 18 unmarked-absent working days @ 0
    expect(result.summary.net_salary).toBe(13000);
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
      .get('/api/reports/salary/compute?year=2026&month=8')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.present_days).toBe(1);
    // 10 weekend days @1000 + 1 present day @1000, rest unmarked-absent @ 0
    expect(res.body.summary.net_salary).toBe(11000);
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
      .get('/api/reports/salary/compute/download?year=2026&month=8')
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
