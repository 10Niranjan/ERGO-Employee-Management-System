'use strict';

/**
 * User Management API Tests (Phase 2)
 * All DB calls are mocked. Tests cover employee CRUD, authorization, and validation.
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../db/pool', () => {
  const q = jest.fn();
  // getClient returns a mock client object (for transactions)
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  return {
    query: q,
    getClient: jest.fn().mockResolvedValue(mockClient),
    pool: { query: jest.fn(), end: jest.fn(), on: jest.fn() },
    _mockClient: mockClient,
  };
});

const { query, getClient, _mockClient: mockClient } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const app = require('../app');

const ADMIN_TOKEN    = signToken({ id: 1, role: 'admin',    employee_id: 'ADMIN001' });
const EMPLOYEE_TOKEN = signToken({ id: 2, role: 'employee', employee_id: 'EMP001'   });

const SAFE_USER = {
  id: 2, employee_id: 'EMP001', role: 'employee',
  name: 'Test Employee', email: 'test@ergo.com', phone: '9999999999',
  designation: 'Developer', date_of_joining: '2025-01-01',
  per_day_salary: '1500.00', first_login: true, status: 'active',
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// =============================================================================
// Authorization
// =============================================================================
describe('Authorization: Employee cannot access admin routes', () => {
  test('GET /api/users returns 403 for employee token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/users returns 403 for employee token', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ name: 'X', email: 'x@x.com' });
    expect(res.status).toBe(403);
  });

  test('GET /api/users returns 401 without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// GET /api/users
// =============================================================================
describe('GET /api/users', () => {
  test('returns paginated employee list', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })     // count
      .mockResolvedValueOnce({ rows: [SAFE_USER] });          // data

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
    // password_hash must never appear
    expect(res.body.users[0].password_hash).toBeUndefined();
  });

  test('returns 400 for invalid status filter', async () => {
    const res = await request(app)
      .get('/api/users?status=unknown')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// GET /api/users/:id
// =============================================================================
describe('GET /api/users/:id', () => {
  test('returns employee details for admin', async () => {
    query.mockResolvedValueOnce({ rows: [SAFE_USER] });
    const res = await request(app)
      .get('/api/users/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.user.employee_id).toBe('EMP001');
  });

  test('returns 404 when employee not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/users/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// POST /api/users — Employee creation
// =============================================================================
describe('POST /api/users', () => {
  function setupCreateMocks() {
    // Transaction: BEGIN, email check, generateEmployeeId (FOR UPDATE query), INSERT user,
    // leave types fetch, leave balance insert, COMMIT
    mockClient.query
      .mockResolvedValueOnce({})                                      // BEGIN
      .mockResolvedValueOnce({ rows: [] })                            // email uniqueness check
      .mockResolvedValueOnce({ rows: [{ employee_id: 'EMP001' }] })  // generateEmployeeId
      .mockResolvedValueOnce({ rows: [SAFE_USER] })                   // INSERT user
      .mockResolvedValueOnce({ rows: [{ id: 1, yearly_quota: 12 }] }) // active leave types
      .mockResolvedValueOnce({ rows: [] })                            // insert leave balance
      .mockResolvedValueOnce({});                                     // COMMIT
  }

  test('creates employee and returns temp_password', async () => {
    setupCreateMocks();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Test Employee',
        email: 'test@ergo.com',
        designation: 'Developer',
        per_day_salary: 1500,
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.temp_password).toBeDefined();
    // Temp password must meet policy: min 8 chars, letter, number
    expect(res.body.temp_password.length).toBeGreaterThanOrEqual(8);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('creates employee with custom leaves_this_year', async () => {
    setupCreateMocks();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Test Employee Two',
        email: 'test2@ergo.com',
        designation: 'Designer',
        per_day_salary: 1200,
        leaves_this_year: 20,
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.temp_password).toBeDefined();
  });

  test('returns 400 if leaves_this_year is negative', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Test',
        email: 'test@ergo.com',
        leaves_this_year: -5,
      });
    expect(res.status).toBe(400);
  });

  test('returns 400 if name is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'test@ergo.com' });
    expect(res.status).toBe(400);
  });

  test('returns 400 if email is invalid', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Test', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('returns 409 if email already exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })       // email check — found
      .mockResolvedValueOnce({});                          // ROLLBACK

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'Test', email: 'existing@ergo.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email already exists/i);
  });

  test('generated temp password satisfies policy (letter + number)', async () => {
    setupCreateMocks();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'New Emp', email: 'new@ergo.com' });
    const tp = res.body.temp_password || '';
    expect(/[a-zA-Z]/.test(tp)).toBe(true);
    expect(/[0-9]/.test(tp)).toBe(true);
    expect(tp.length).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================
// PUT /api/users/:id — Employee update
// =============================================================================
describe('PUT /api/users/:id', () => {
  test('updates employee designation (no email change)', async () => {
    // No email in body → 2 DB calls: exists check + UPDATE
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'employee' }] }) // exists check
      .mockResolvedValueOnce({ rows: [{ ...SAFE_USER, designation: 'Senior Developer' }] }); // UPDATE

    const res = await request(app)
      .put('/api/users/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ designation: 'Senior Developer' });
    expect(res.status).toBe(200);
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.designation).toBe('Senior Developer');
  });

  test('returns 404 if employee not found', async () => {
    // exists check returns empty — controller returns 404 immediately
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/users/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  test('returns 409 if email already taken by another employee', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'employee' }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // email conflict
    const res = await request(app)
      .put('/api/users/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'taken@ergo.com' });
    expect(res.status).toBe(409);
  });
});

// =============================================================================
// PATCH /api/users/:id/status — Deactivate/Reactivate
// =============================================================================
describe('PATCH /api/users/:id/status', () => {
  test('deactivates an employee', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...SAFE_USER, status: 'inactive' }] });
    const res = await request(app)
      .patch('/api/users/2/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('inactive');
  });

  test('reactivates an employee', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...SAFE_USER, status: 'active' }] });
    const res = await request(app)
      .patch('/api/users/2/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('active');
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/users/2/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'suspended' });
    expect(res.status).toBe(400);
  });

  test('returns 400 if admin tries to deactivate themselves', async () => {
    // ADMIN_TOKEN has id=1; we send PATCH /api/users/1/status
    const res = await request(app)
      .patch('/api/users/1/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot change your own status/i);
  });

  test('returns 404 if employee not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/api/users/999/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// DELETE /api/users/:id — Permanent removal
// =============================================================================
describe('DELETE /api/users/:id', () => {
  test('admin permanently deletes an employee', async () => {
    query.mockResolvedValueOnce({ rows: [{ employee_id: 'EMP001', name: 'Test Employee' }] });
    const res = await request(app)
      .delete('/api/users/2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/EMP001/);
  });

  test('returns 404 if employee not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/users/999')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });

  test('cannot delete an admin account through this endpoint', async () => {
    // The DELETE query itself is scoped to role='employee', so targeting an
    // admin id matches zero rows — same as a non-existent employee.
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/users/1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });

  test('employee token cannot delete', async () => {
    const res = await request(app)
      .delete('/api/users/2')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });
});
