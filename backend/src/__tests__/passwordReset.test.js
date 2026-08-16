'use strict';

/**
 * Password-reset flow tests.
 *
 * Covers the six security scenarios the feature was specced against:
 *   1. expired OTP
 *   2. reused (already-consumed) OTP
 *   3. max-attempt lockout
 *   4. expired temp password
 *   5. bypassing the must-change-password redirect
 *   6. a non-admin hitting the admin-only reset endpoints
 * plus the anti-enumeration guarantees and reset-session-token single use.
 */

const request = require('supertest');

jest.mock('../db/pool', () => {
  const q = jest.fn();
  const mockClient = { query: jest.fn(), release: jest.fn() };
  return {
    query: q,
    getClient: jest.fn().mockResolvedValue(mockClient),
    pool: {
      query: jest.fn().mockResolvedValue({
        rows: [{ status: 'active', first_login: false, password_changed_at: null }],
      }),
      end: jest.fn(),
      on: jest.fn(),
    },
    _mockClient: mockClient,
  };
});

// Email delivery is exercised separately; here it must never block a flow.
jest.mock('../services/mailer', () => ({
  sendAdminOtpEmail: jest.fn().mockResolvedValue({ delivered: true, transport: 'test' }),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue({ delivered: true, transport: 'test' }),
  sendMail: jest.fn().mockResolvedValue({ delivered: true, transport: 'test' }),
  SUPPORT: 'it@ergo-asia.co',
}));

const { query, pool, _mockClient: mockClient } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const { hashOtp } = require('../utils/secureTokens');
const app = require('../app');

const ADMIN = { id: 1, name: 'System Admin', email: 'admin@ergo.com' };
const EMPLOYEE_TOKEN = signToken({ id: 2, role: 'employee', employee_id: 'EMP001' });
const ADMIN_TOKEN = signToken({ id: 1, role: 'admin', employee_id: 'ADMIN001' });

const minutesFromNow = (m) => new Date(Date.now() + m * 60_000);

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  pool.query.mockResolvedValue({
    rows: [{ status: 'active', first_login: false, password_changed_at: null }],
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Anti-enumeration
// ═════════════════════════════════════════════════════════════════════════════
describe('Anti-enumeration on request-initiation endpoints', () => {
  test('admin forgot-password returns the same body for known and unknown emails', async () => {
    // Unknown address — no admin row.
    query.mockResolvedValueOnce({ rows: [] });
    const unknown = await request(app)
      .post('/api/auth/admin/forgot-password')
      .send({ email: 'nobody@nowhere.com' });

    // Known address — full happy path.
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })              // admin lookup
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })       // hourly throttle check
      .mockResolvedValueOnce({ rows: [] })                   // supersede old codes
      .mockResolvedValueOnce({ rows: [] });                  // insert new code
    const known = await request(app)
      .post('/api/auth/admin/forgot-password')
      .send({ email: 'admin@ergo.com' });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  test('employee forgot-password returns the same body for known and unknown identifiers', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const unknown = await request(app)
      .post('/api/auth/employee/forgot-password')
      .send({ identifier: 'GHOST999' });

    query
      .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Test', employee_id: 'EMP001' }] })
      .mockResolvedValueOnce({ rows: [] }); // upsert request
    const known = await request(app)
      .post('/api/auth/employee/forgot-password')
      .send({ identifier: 'EMP001' });

    expect(unknown.body).toEqual(known.body);
  });

  test('a throttled account is indistinguishable from an accepted one', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] }); // at the hourly cap

    const res = await request(app)
      .post('/api/auth/admin/forgot-password')
      .send({ email: 'admin@ergo.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an admin account matches/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Scenario 1 & 2 — expired and reused OTP
// ═════════════════════════════════════════════════════════════════════════════
describe('OTP verification', () => {
  test('rejects an expired OTP', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          otp_hash: hashOtp('123456'),
          expires_at: minutesFromNow(-1), // already lapsed
          attempt_count: 0,
        }],
      });

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('rejects an already-consumed OTP (no unconsumed row remains)', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({ rows: [] }); // the only code was consumed

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  test('an incorrect code increments attempts and reports the remainder', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, otp_hash: hashOtp('123456'), expires_at: minutesFromNow(4), attempt_count: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ attempt_count: 1 }] });

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.attempts_remaining).toBe(4);
  });

  // ── Scenario 3 — max-attempt lockout ──────────────────────────────────────
  test('locks the code after the 5th failed attempt', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, otp_hash: hashOtp('123456'), expires_at: minutesFromNow(4), attempt_count: 4 }],
      })
      .mockResolvedValueOnce({ rows: [{ attempt_count: 5 }] }) // now at the cap
      .mockResolvedValueOnce({ rows: [] });                    // burn the code

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '000000' });

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too many incorrect attempts/i);
  });

  test('a locked-out code is refused even when the correct value is supplied', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, otp_hash: hashOtp('123456'), expires_at: minutesFromNow(4), attempt_count: 5 }],
      });

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '123456' }); // the RIGHT code

    expect(res.status).toBe(429);
  });

  test('a correct code returns a reset session token', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, otp_hash: hashOtp('654321'), expires_at: minutesFromNow(4), attempt_count: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] })  // consume the code
      .mockResolvedValueOnce({ rows: [] }); // store the session token

    const res = await request(app)
      .post('/api/auth/admin/verify-otp')
      .send({ email: 'admin@ergo.com', otp: '654321' });

    expect(res.status).toBe(200);
    expect(typeof res.body.reset_session_token).toBe('string');
    expect(res.body.reset_session_token.length).toBeGreaterThanOrEqual(64);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Reset session token
// ═════════════════════════════════════════════════════════════════════════════
describe('Admin reset-password', () => {
  test('rejects a weak password before touching the token', async () => {
    const res = await request(app)
      .post('/api/auth/admin/reset-password')
      .send({ reset_session_token: 'a'.repeat(64), new_password: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.failed_rules).toEqual(
      expect.arrayContaining(['length', 'uppercase', 'number', 'symbol'])
    );
  });

  test('rejects an already-consumed reset session token', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                       // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 5, admin_id: 1, expires_at: minutesFromNow(5),
          consumed_at: new Date(), email: ADMIN.email, name: ADMIN.name,
        }],
      })
      .mockResolvedValueOnce({});                      // ROLLBACK

    const res = await request(app)
      .post('/api/auth/admin/reset-password')
      .send({ reset_session_token: 'a'.repeat(64), new_password: 'ValidPass@2026' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired or was already used/i);
  });

  test('rejects an expired reset session token', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 5, admin_id: 1, expires_at: minutesFromNow(-1),
          consumed_at: null, email: ADMIN.email, name: ADMIN.name,
        }],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/auth/admin/reset-password')
      .send({ reset_session_token: 'a'.repeat(64), new_password: 'ValidPass@2026' });

    expect(res.status).toBe(400);
  });

  test('rejects an unknown reset session token', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/auth/admin/reset-password')
      .send({ reset_session_token: 'b'.repeat(64), new_password: 'ValidPass@2026' });

    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Scenario 6 — admin-only endpoints
// ═════════════════════════════════════════════════════════════════════════════
describe('Admin-only reset endpoints', () => {
  test('employee token cannot list reset requests', async () => {
    const res = await request(app)
      .get('/api/admin/password-reset-requests')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('employee token cannot resolve a reset request', async () => {
    const res = await request(app)
      .post('/api/admin/password-reset-requests/1/resolve')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/admin/password-reset-requests');
    expect(res.status).toBe(401);
  });

  test('an already-resolved request cannot be resolved twice', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 7, employee_id: 2, status: 'resolved', name: 'Test', email: 't@e.com', emp_code: 'EMP001' }],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/admin/password-reset-requests/7/resolve')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already resolved/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Scenario 5 — bypassing the mandatory password change
// ═════════════════════════════════════════════════════════════════════════════
describe('Forced password change', () => {
  test('is refused when no change is pending (first_login already false)', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 2, name: 'Test', email: 't@e.com', first_login: false }],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/auth/employee/force-change-password')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ new_password: 'ValidPass@2026' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no password change is pending/i);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/auth/employee/force-change-password')
      .send({ new_password: 'ValidPass@2026' });
    expect(res.status).toBe(401);
  });

  test('enforces the strong password policy', async () => {
    const res = await request(app)
      .post('/api/auth/employee/force-change-password')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ new_password: 'nosymbol1A' });

    expect(res.status).toBe(400);
    expect(res.body.failed_rules).toEqual(['symbol']);
  });

  // Regression: a first_login user could previously reach business data by
  // calling the API directly (or by typing a dashboard URL), walking straight
  // past the mandatory reset screen.
  describe('cannot be bypassed while a change is pending', () => {
    const pendingUser = {
      rows: [{ status: 'active', first_login: true, password_changed_at: null }],
    };

    test.each([
      ['/api/attendance/today'],
      ['/api/leaves/balances'],
      ['/api/leave-types'],
      ['/api/holidays'],
      ['/api/reports/payslips'],
    ])('%s is refused for a user who must change their password', async (route) => {
      pool.query.mockResolvedValue(pendingUser);

      const res = await request(app)
        .get(route)
        .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.must_change_password).toBe(true);
    });

    test('an admin with a pending change cannot reach admin routes either', async () => {
      pool.query.mockResolvedValue(pendingUser);

      const res = await request(app)
        .get('/api/admin/password-reset-requests')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.must_change_password).toBe(true);
    });

    test('the password-change endpoint itself stays reachable', async () => {
      pool.query.mockResolvedValue(pendingUser);
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ id: 2, name: 'Test', email: 't@e.com', first_login: true }],
        })
        .mockResolvedValueOnce({ rows: [] })   // password history lookup
        .mockResolvedValueOnce({ rows: [] })   // UPDATE users
        .mockResolvedValueOnce({ rows: [] })   // INSERT history
        .mockResolvedValueOnce({ rows: [] })   // prune history
        .mockResolvedValueOnce({ rows: [] })   // close out the reset request
        .mockResolvedValueOnce({});            // COMMIT

      const res = await request(app)
        .post('/api/auth/employee/force-change-password')
        .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
        .send({ new_password: 'ValidPass@2026' });

      expect(res.status).toBe(200);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Scenario 4 — expired temp password / dead sessions
// ═════════════════════════════════════════════════════════════════════════════
describe('Session invalidation after a password change', () => {
  test('a token issued before password_changed_at is rejected', async () => {
    // Password changed one hour after this token was minted.
    pool.query.mockResolvedValueOnce({
      rows: [{
        status: 'active',
        first_login: false,
        password_changed_at: new Date(Date.now() + 60 * 60 * 1000),
      }],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/session ended/i);
  });

  test('a deactivated account cannot keep using an unexpired token', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ status: 'inactive', first_login: false, password_changed_at: null }],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(401);
  });

  test('a token issued after the last password change is accepted', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        status: 'active',
        first_login: false,
        password_changed_at: new Date(Date.now() - 60 * 60 * 1000),
      }],
    });
    query.mockResolvedValueOnce({ rows: [{ id: 2, employee_id: 'EMP001', role: 'employee' }] });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
  });

  test('expired temp passwords are aged out when the queue is listed', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                 // the ageing UPDATE
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })     // count
      .mockResolvedValueOnce({ rows: [] });                // page

    const res = await request(app)
      .get('/api/admin/password-reset-requests')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const ageingCall = query.mock.calls[0][0];
    expect(ageingCall).toMatch(/SET status = 'expired'/);
    expect(ageingCall).toMatch(/temp_expires_at <= NOW\(\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Secrets are never stored in the clear
// ═════════════════════════════════════════════════════════════════════════════
describe('Secret handling', () => {
  test('the OTP is persisted as a hash, never as plaintext', async () => {
    query
      .mockResolvedValueOnce({ rows: [ADMIN] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post('/api/auth/admin/forgot-password')
      .send({ email: 'admin@ergo.com' });

    const insert = query.mock.calls.find(([sql]) => /INSERT INTO admin_otp_requests/.test(sql));
    expect(insert).toBeDefined();

    const storedValue = insert[1][1];
    expect(storedValue).toMatch(/^[a-f0-9]{64}$/);  // HMAC-SHA256 hex digest
    expect(storedValue).not.toMatch(/^\d{6}$/);      // definitively not the code
  });
});
