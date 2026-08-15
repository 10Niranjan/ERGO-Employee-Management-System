'use strict';

/**
 * Auth API Tests
 * Tests the /api/auth/login, /api/auth/reset-password, and /api/auth/me endpoints.
 * Database calls are mocked to keep tests fast and isolated.
 * Tokens for non-login tests are generated directly via signToken() to avoid
 * hitting the login rate limiter during the test run.
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');

// ─── Mock the db/pool module before app is imported ───────────────────────────
// Use a factory so query is explicitly jest.fn() and all requires of '../db/pool'
// share the same mock instance.
jest.mock('../db/pool', () => {
  const queryMock = jest.fn();
  return {
    query: queryMock,
    getClient: jest.fn(),
    pool: { query: jest.fn(), end: jest.fn(), on: jest.fn() },
  };
});

const { query } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const app = require('../app');

// ─── Test data ────────────────────────────────────────────────────────────────
const VALID_PASSWORD = 'Password1';
let hashedPassword;

// Pre-built tokens for non-login tests — avoids hitting the rate limiter
const ADMIN_TOKEN = signToken({ id: 1, role: 'admin', employee_id: 'ADMIN001' });
const EMPLOYEE_TOKEN = signToken({ id: 2, role: 'employee', employee_id: 'EMP001' });

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(VALID_PASSWORD, 4);
});

afterEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// POST /api/auth/login
// =============================================================================
describe('POST /api/auth/login', () => {
  const endpoint = '/api/auth/login';

  const makeUser = (overrides = {}) => ({
    id: 1,
    employee_id: 'ADMIN001',
    role: 'admin',
    name: 'System Admin',
    email: 'admin@ergo.com',
    password_hash: hashedPassword,
    first_login: true,
    status: 'active',
    ...overrides,
  });

  test('returns 400 if identifier is missing', async () => {
    const res = await request(app).post(endpoint).send({ password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('returns 400 if password is missing', async () => {
    const res = await request(app).post(endpoint).send({ identifier: 'admin@ergo.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('returns 401 with generic message for unknown identifier', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'nobody@ergo.com', password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('returns 401 with generic message for wrong password', async () => {
    query.mockResolvedValueOnce({ rows: [makeUser()] });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'admin@ergo.com', password: 'WrongPass99' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('returns 401 for inactive account (generic message)', async () => {
    query.mockResolvedValueOnce({ rows: [makeUser({ status: 'inactive' })] });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'admin@ergo.com', password: VALID_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('returns 200 with token and user info on valid login (by email)', async () => {
    query.mockResolvedValueOnce({ rows: [makeUser()] });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'admin@ergo.com', password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.first_login).toBe(true);
    // password_hash must NOT be in the response
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('returns 200 with token on valid login (by employee_id)', async () => {
    query.mockResolvedValueOnce({ rows: [makeUser()] });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'ADMIN001', password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('employee login works and returns role=employee', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeUser({
          id: 2,
          employee_id: 'EMP001',
          role: 'employee',
          name: 'Test Employee',
          email: 'emp@ergo.com',
          first_login: false,
        }),
      ],
    });
    const res = await request(app)
      .post(endpoint)
      .send({ identifier: 'emp@ergo.com', password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('employee');
  });
});

// =============================================================================
// POST /api/auth/reset-password
// Uses pre-built tokens — does NOT call /api/auth/login, avoids rate limit.
// =============================================================================
describe('POST /api/auth/reset-password', () => {
  const endpoint = '/api/auth/reset-password';

  test('returns 401 without token', async () => {
    const res = await request(app).post(endpoint).send({ new_password: 'NewPass1' });
    expect(res.status).toBe(401);
  });

  test('returns 400 if new_password is missing', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 if new_password is too short', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ new_password: 'short' });
    expect(res.status).toBe(400);
  });

  test('returns 400 if password has no number', async () => {
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ new_password: 'NoNumbersHere' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/letter.*number|number.*letter/i);
  });

  test('returns 200 on valid password reset', async () => {
    // Mock the UPDATE query inside resetPassword controller
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ new_password: 'NewSecure1' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password updated/i);
  });

  test('works for employee role too', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ new_password: 'EmpNewPass1' });
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// GET /api/auth/me
// Uses pre-built token — does NOT call /api/auth/login, avoids rate limit.
// =============================================================================
describe('GET /api/auth/me', () => {
  const endpoint = '/api/auth/me';

  test('returns 401 without token', async () => {
    const res = await request(app).get(endpoint);
    expect(res.status).toBe(401);
  });

  test('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer this.is.not.valid');
    expect(res.status).toBe(401);
  });

  test('returns user profile with valid token', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          employee_id: 'ADMIN001',
          role: 'admin',
          name: 'Test Admin',
          email: 'admin@ergo.com',
          designation: 'System Administrator',
          date_of_joining: null,
          first_login: false,
          status: 'active',
        },
      ],
    });
    const res = await request(app)
      .get(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.employee_id).toBe('ADMIN001');
    // password_hash must NOT be in the response
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('returns 404 if user not found in DB (token valid but user deleted)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get(endpoint)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// Authorization middleware — role-based access
// =============================================================================
describe('Authorization middleware', () => {
  test('GET /api/health returns 200 (no auth required)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('Unknown route returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  test('Expired/invalid token returns 401 on protected route', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer expired.or.invalid.token');
    expect(res.status).toBe(401);
  });
});
