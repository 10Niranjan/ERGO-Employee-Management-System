'use strict';

/**
 * Leave Management API Tests (Phase 4)
 * Tests cover leave balances, application validation, 9 AM cutoff,
 * weekend/holiday exclusion, overlapping prevention, and admin approval/decline.
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
const app = require('../app');

const ADMIN_TOKEN    = signToken({ id: 1, role: 'admin',    employee_id: 'ADMIN001' });
const EMPLOYEE_TOKEN = signToken({ id: 2, role: 'employee', employee_id: 'EMP001'   });
const OTHER_EMP_TOKEN= signToken({ id: 3, role: 'employee', employee_id: 'EMP002'   });

const SAMPLE_LEAVE_TYPE_PAID = {
  id: 1,
  name: 'Casual Leave',
  is_paid: true,
  yearly_quota: 12,
  is_active: true,
};

const SAMPLE_LEAVE_TYPE_UNPAID = {
  id: 4,
  name: 'Unpaid Leave',
  is_paid: false,
  yearly_quota: 0,
  is_active: true,
};

const SAMPLE_APPLICATION = {
  id: 100,
  user_id: 2,
  leave_type_id: 1,
  start_date: '2026-09-01',
  end_date: '2026-09-02',
  working_days_count: 2,
  reason: 'Family event',
  status: 'pending',
  created_at: new Date().toISOString(),
};

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

// =============================================================================
// GET /api/leaves/balances
// =============================================================================
describe('GET /api/leaves/balances', () => {
  test('employee views own leave balances', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // active types for ensure
      .mockResolvedValueOnce({ rows: [] }) // insert default if missing (row already exists)
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 2,
          leave_type_id: 1,
          year: 2026,
          allotted: 12,
          used: 2,
          remaining: 10,
          name: 'Casual Leave',
          is_paid: true,
        }],
      });

    const res = await request(app)
      .get('/api/leaves/balances?year=2026')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.balances).toHaveLength(1);
    expect(res.body.balances[0].remaining).toBe(10);
  });

  test('employee cannot view another employee balances', async () => {
    const res = await request(app)
      .get('/api/leaves/balances?user_id=3')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('admin can view any employee balances', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 2,
          leave_type_id: 1,
          year: 2026,
          allotted: 12,
          used: 0,
          remaining: 12,
          name: 'Casual Leave',
          is_paid: true,
        }],
      });

    const res = await request(app)
      .get('/api/leaves/balances?user_id=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(2);
  });
});

// =============================================================================
// POST /api/leaves — Leave Application
// =============================================================================
describe('POST /api/leaves', () => {
  test('employee applies for valid paid leave with sufficient balance', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] }) // user check
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // leave type check
      .mockResolvedValueOnce({ rows: [] }) // holidays check
      .mockResolvedValueOnce({ rows: [] }) // overlap check
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // ensure balances
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 10, allotted: 12, used: 2 }] }) // balance check
      .mockResolvedValueOnce({ rows: [SAMPLE_APPLICATION] }); // INSERT

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        reason: 'Family event',
      });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('pending');
  });

  test('employee applies for unpaid leave without requiring paid balance', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_UNPAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no overlaps
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_APPLICATION,
          leave_type_id: 4,
          status: 'pending',
        }],
      }); // INSERT

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 4,
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        reason: 'Personal leave',
      });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('pending');
  });

  test('returns 400 for missing reason', async () => {
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        reason: '',
      });

    expect(res.status).toBe(400);
  });

  test('returns 400 if start_date > end_date', async () => {
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-05',
        end_date: '2026-09-01',
        reason: 'Typo in dates',
      });

    expect(res.status).toBe(400);
  });

  test('returns 400 if date range contains 0 working days (weekend only)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] }); // holidays check

    // 2026-09-05 is Saturday, 2026-09-06 is Sunday
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-05',
        end_date: '2026-09-06',
        reason: 'Weekend leave',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/0 working days/i);
  });

  test('returns 400 for insufficient leave balance', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no overlaps
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 1, allotted: 12, used: 11 }] }); // only 1 day remaining, requested 2

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        reason: 'Need 2 days',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient leave balance/i);
  });

  test('returns 409 for overlapping active leave request', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 99,
          status: 'pending',
          start_date: '2026-09-01',
          end_date: '2026-09-05',
        }],
      }); // overlap exists

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        leave_type_id: 1,
        start_date: '2026-09-02',
        end_date: '2026-09-03',
        reason: 'Conflict',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/overlapping/i);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Admin-on-behalf-of filing (backdated leave)
  // ───────────────────────────────────────────────────────────────────────────
  test('admin files backdated paid leave on behalf of employee — auto-approved, balance deducted', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] }) // target user check
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // leave type check
      .mockResolvedValueOnce({ rows: [] }) // holidays check
      .mockResolvedValueOnce({ rows: [] }) // overlap check
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // ensure balances (soft check)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 10, allotted: 12, used: 2 }] }); // balance check (soft)

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 200, user_id: 2, leave_type_id: 1,
          start_date: '2026-07-06', end_date: '2026-07-07',
          working_days_count: 2, reason: 'Backdated sick day', status: 'pending', filed_by: 1,
        }],
      }) // INSERT leave_applications
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // ensure balances (hard, inside approve)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 10, allotted: 12, used: 2, remaining: 10 }] }) // balance FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ remaining: 8 }] }) // applyLedgerEntry: UPDATE leave_balances
      .mockResolvedValueOnce({ rows: [{ id: 555 }] }) // applyLedgerEntry: INSERT leave_ledger
      .mockResolvedValueOnce({
        rows: [{
          id: 200, user_id: 2, leave_type_id: 1,
          start_date: '2026-07-06', end_date: '2026-07-07',
          working_days_count: 2, status: 'approved', reviewed_by: 1, filed_by: 1,
        }],
      }) // UPDATE leave_applications -> approved
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        user_id: 2,
        leave_type_id: 1,
        start_date: '2026-07-06',
        end_date: '2026-07-07',
        reason: 'Backdated sick day',
      });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('approved');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('admin backdated filing with insufficient balance rolls back and returns 400', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 10, allotted: 12, used: 2 }] }); // soft check passes

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 201, user_id: 2, leave_type_id: 1,
          start_date: '2026-07-06', end_date: '2026-07-07',
          working_days_count: 2, reason: 'Backdated', status: 'pending', filed_by: 1,
        }],
      }) // INSERT leave_applications
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // ensure balances (hard)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 10, allotted: 12, used: 11, remaining: 1 }] }) // only 1 left, need 2
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        user_id: 2,
        leave_type_id: 1,
        start_date: '2026-07-06',
        end_date: '2026-07-07',
        reason: 'Backdated',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient balance/i);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('non-admin cannot bypass the past-date block by sending user_id', async () => {
    const res = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        user_id: 3, // spoofed target — should be ignored, employee is not an admin
        leave_type_id: 1,
        start_date: '2026-07-06', // in the past relative to this suite's dates
        end_date: '2026-07-07',
        reason: 'Trying to backdate',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/past dates/i);
  });
});

// =============================================================================
// GET /api/leaves
// =============================================================================
describe('GET /api/leaves', () => {
  test('returns leave applications list for employee', async () => {
    query.mockResolvedValueOnce({ rows: [SAMPLE_APPLICATION] });

    const res = await request(app)
      .get('/api/leaves')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
  });

  test('admin can view all leave requests with filter', async () => {
    query.mockResolvedValueOnce({ rows: [SAMPLE_APPLICATION] });

    const res = await request(app)
      .get('/api/leaves?status=pending')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
  });
});

// =============================================================================
// PUT /api/leaves/:id/status — Admin Review
// =============================================================================
describe('PUT /api/leaves/:id/status', () => {
  test('admin approves paid leave and deducts balance', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 100,
          user_id: 2,
          leave_type_id: 1,
          start_date: '2026-09-01',
          end_date: '2026-09-02',
          working_days_count: 2,
          status: 'pending',
          is_paid: true,
        }],
      }) // SELECT application FOR UPDATE
      .mockResolvedValueOnce({ rows: [SAMPLE_LEAVE_TYPE_PAID] }) // ensure balances
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          allotted: 12,
          used: 2,
          remaining: 10,
        }],
      }) // SELECT balance FOR UPDATE (10 remaining >= 2)
      .mockResolvedValueOnce({ rows: [{ remaining: 8 }] }) // applyLedgerEntry: UPDATE leave_balances (used + 2) RETURNING remaining
      .mockResolvedValueOnce({ rows: [{ id: 555 }] }) // applyLedgerEntry: INSERT INTO leave_ledger
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_APPLICATION,
          status: 'approved',
          reviewed_by: 1,
        }],
      }) // UPDATE leave_applications
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put('/api/leaves/100/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'approved', admin_notes: 'Approved by manager' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('approved');
  });

  test('admin declines leave with mandatory reason without balance deduction', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 100,
          user_id: 2,
          leave_type_id: 1,
          start_date: '2026-09-01',
          end_date: '2026-09-02',
          working_days_count: 2,
          status: 'pending',
          is_paid: true,
        }],
      }) // SELECT application
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_APPLICATION,
          status: 'declined',
          decline_reason: 'Critical sprint deliverables',
        }],
      }) // UPDATE application
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put('/api/leaves/100/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        status: 'declined',
        decline_reason: 'Critical sprint deliverables',
      });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('declined');
  });

  test('admin decline without reason returns 400', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 100,
          status: 'pending',
          is_paid: true,
        }],
      })
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .put('/api/leaves/100/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'declined' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/decline reason is mandatory/i);
  });

  test('employee cannot review or approve leave requests', async () => {
    const res = await request(app)
      .put('/api/leaves/100/status')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
  });
});
