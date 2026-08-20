'use strict';

/**
 * Leave Type, Holiday, and Salary API Tests (Phase 2)
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

const LEAVE_TYPE = {
  id: 1, name: 'Casual Leave', is_paid: true, yearly_quota: 12,
  is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const HOLIDAY = {
  id: 1, name: 'Republic Day', date: '2025-01-26',
  is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

// =============================================================================
// Leave Types
// =============================================================================
describe('GET /api/leave-types', () => {
  test('returns active leave types for employee', async () => {
    query.mockResolvedValueOnce({ rows: [LEAVE_TYPE] });
    const res = await request(app)
      .get('/api/leave-types')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.leave_types).toHaveLength(1);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/leave-types');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/leave-types', () => {
  test('admin creates a leave type', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                     // BEGIN
      .mockResolvedValueOnce({ rows: [] })           // name uniqueness check
      .mockResolvedValueOnce({ rows: [LEAVE_TYPE] }) // INSERT
      .mockResolvedValueOnce({});                    // COMMIT
    const res = await request(app)
      .post('/api/leave-types')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Casual Leave', is_paid: true, yearly_quota: 12 });
    expect(res.status).toBe(201);
    expect(res.body.leave_type.name).toBe('Casual Leave');
    expect(res.body.leave_type.is_paid).toBe(true);
  });

  test('returns 403 for employee', async () => {
    const res = await request(app)
      .post('/api/leave-types')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ name: 'X', is_paid: true, yearly_quota: 5 });
    expect(res.status).toBe(403);
  });

  test('returns 400 if is_paid missing', async () => {
    const res = await request(app)
      .post('/api/leave-types')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Test', yearly_quota: 5 });
    expect(res.status).toBe(400);
  });

  test('returns 409 for duplicate name', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                     // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }); // Name exists

    const res = await request(app)
      .post('/api/leave-types')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Casual Leave', is_paid: true, yearly_quota: 12 });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/leave-types/:id', () => {
  test('admin updates leave type quota (no name change)', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1, yearly_quota: 12 }] })    // exists check
      .mockResolvedValueOnce({ rows: [] })                               // CASCADE update leave_balances
      .mockResolvedValueOnce({ rows: [{ ...LEAVE_TYPE, yearly_quota: 15 }] }) // UPDATE leave_types
      .mockResolvedValueOnce({});                                        // COMMIT
    const res = await request(app)
      .put('/api/leave-types/1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ yearly_quota: 15 });
    expect(res.status).toBe(200);
    expect(res.body.leave_type.yearly_quota).toBe(15);
  });

  test('returns 404 for non-existent leave type', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                    // BEGIN
      .mockResolvedValueOnce({ rows: [] });         // exists check returns empty
    const res = await request(app)
      .put('/api/leave-types/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ yearly_quota: 10 });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/leave-types/:id/status', () => {
  test('admin deactivates a leave type', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...LEAVE_TYPE, is_active: false }] });
    const res = await request(app)
      .patch('/api/leave-types/1/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.leave_type.is_active).toBe(false);
  });

  test('returns 400 for invalid is_active value', async () => {
    const res = await request(app)
      .patch('/api/leave-types/1/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ is_active: 'yes' });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Holidays
// =============================================================================
describe('GET /api/holidays', () => {
  test('returns holidays for current year', async () => {
    query.mockResolvedValueOnce({ rows: [HOLIDAY] });
    const res = await request(app)
      .get('/api/holidays')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.holidays).toHaveLength(1);
  });
});

describe('POST /api/holidays', () => {
  test('admin creates a holiday', async () => {
    query.mockResolvedValueOnce({ rows: [HOLIDAY] });
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Republic Day', date: '2025-01-26' });
    expect(res.status).toBe(201);
    expect(res.body.holiday.name).toBe('Republic Day');
  });

  test('returns 403 for employee', async () => {
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ name: 'X', date: '2025-01-26' });
    expect(res.status).toBe(403);
  });

  test('returns 400 for invalid date', async () => {
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'X', date: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  test('returns 409 for duplicate date', async () => {
    // Simulate PG unique_violation error
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Another Holiday', date: '2025-01-26' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });
});

describe('PUT /api/holidays/:id', () => {
  test('admin updates a holiday name', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...HOLIDAY, name: 'Republic Day (Updated)' }] });
    const res = await request(app)
      .put('/api/holidays/1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Republic Day (Updated)' });
    expect(res.status).toBe(200);
    expect(res.body.holiday.name).toBe('Republic Day (Updated)');
  });

  test('returns 404 for non-existent holiday', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/holidays/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/holidays/:id', () => {
  test('admin deletes a holiday', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/api/holidays/1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  test('returns 404 when holiday not found', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app)
      .delete('/api/holidays/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });

  test('returns 403 for employee', async () => {
    const res = await request(app)
      .delete('/api/holidays/1')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// Salary Management
// =============================================================================
describe('GET /api/salary', () => {
  test('returns employee salary rates for admin', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 2, employee_id: 'EMP001', name: 'Test', monthly_salary: '31000.00', status: 'active' }],
    });
    const res = await request(app)
      .get('/api/salary')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(1);
  });

  test('returns 403 for employee', async () => {
    const res = await request(app)
      .get('/api/salary')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/salary/:userId', () => {
  test('admin updates employee salary and logs history', async () => {
    mockClient.query
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 2, employee_id: 'EMP001', name: 'Test', monthly_salary: '31000.00' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, employee_id: 'EMP001', name: 'Test', monthly_salary: '62000.00', designation: 'Dev', email: 'test@ergo.com', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 2, old_monthly_salary: '31000.00', new_monthly_salary: '62000.00', changed_by: 1, note: null, changed_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({});  // COMMIT

    const res = await request(app)
      .put('/api/salary/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ monthly_salary: 62000 });

    expect(res.status).toBe(200);
    expect(res.body.employee.monthly_salary).toBe('62000.00');
    expect(res.body.revision).toBeDefined();
    expect(parseFloat(res.body.revision.new_monthly_salary)).toBe(62000);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth_audit_log'),
      expect.arrayContaining(['salary.rate_changed'])
    );
  });

  test('returns 400 for negative salary', async () => {
    mockClient.query.mockResolvedValueOnce({}); // BEGIN (will ROLLBACK after validation)
    const res = await request(app)
      .put('/api/salary/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ monthly_salary: -500 });
    expect(res.status).toBe(400);
  });

  test('returns 403 for employee token', async () => {
    const res = await request(app)
      .put('/api/salary/2')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ monthly_salary: 62000 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/salary/history', () => {
  test('returns salary revision history for admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 1, old_monthly_salary: '30000.00', new_monthly_salary: '31000.00', employee_name: 'Test', changed_by_name: 'Admin' },
      ] });
    const res = await request(app)
      .get('/api/salary/history')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.pagination.total).toBe(3);
  });
});

describe('GET /api/salary/:userId/history', () => {
  test('returns per-employee salary history', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Test', employee_id: 'EMP001' }] }) // emp check
      .mockResolvedValueOnce({ rows: [{ id: 1, old_monthly_salary: '30000.00', new_monthly_salary: '31000.00', changed_by_name: 'Admin', changed_at: new Date().toISOString() }] });
    const res = await request(app)
      .get('/api/salary/2/history')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.employee.employee_id).toBe('EMP001');
    expect(res.body.history).toHaveLength(1);
  });

  test('returns 404 if employee not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/salary/999/history')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
