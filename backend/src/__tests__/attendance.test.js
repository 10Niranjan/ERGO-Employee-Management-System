'use strict';

/**
 * Attendance API Tests (Phase 3)
 * Tests cover marking, today stats & prompt, monthly calendars,
 * correction request workflow, and administrative manual overrides.
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

const SAMPLE_ATTENDANCE = {
  id: 10,
  user_id: 2,
  date: '2026-08-10',
  status: 'present',
  marked_at: new Date().toISOString(),
  correction_status: 'none',
  correction_requested_status: null,
  correction_reason: null,
  correction_declined_reason: null,
  is_admin_override: false,
};

afterEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

// =============================================================================
// POST /api/attendance — Marking Today's Attendance
// =============================================================================
describe('POST /api/attendance', () => {
  test('employee marks attendance as present', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no existing attendance for today
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // INSERT

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'present' });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('present');
  });

  test('employee marks attendance as half_day', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_ATTENDANCE, status: 'half_day' }] });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'half_day' });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('half_day');
  });

  test('employee marks attendance as travel', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_ATTENDANCE, status: 'travel' }] });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'travel' });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('travel');
  });

  test('employee marks attendance as wfh', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_ATTENDANCE, status: 'wfh' }] });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'wfh' });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('wfh');
  });

  test('returns 400 for invalid status string', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'sick_leave' });

    expect(res.status).toBe(400);
  });

  test('returns 409 if attendance already marked for today', async () => {
    query.mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // existing found

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'present' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already.*marked/i);
  });

  test('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .send({ status: 'present' });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// GET /api/attendance/today — Today's Status & Prompt Logic
// =============================================================================
describe('GET /api/attendance/today', () => {
  test('returns prompt info for employee when unmarked on working day', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no holiday today
      .mockResolvedValueOnce({ rows: [] }); // no attendance record today

    const res = await request(app)
      .get('/api/attendance/today')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.date).toBeDefined();
    expect(res.body.attendance).toBeNull();
    // should_prompt depends on whether today is a weekend in real runtime
  });

  test('returns attendance data for employee when already marked', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no holiday
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // attendance exists

    const res = await request(app)
      .get('/api/attendance/today')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.attendance).toBeDefined();
    expect(res.body.should_prompt).toBe(false);
  });

  test('admin view returns live team summary stats', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // holiday check
      .mockResolvedValueOnce({
        rows: [
          { id: 2, employee_id: 'EMP001', name: 'Alice', designation: 'Dev', email: 'a@ergo.com' },
          { id: 3, employee_id: 'EMP002', name: 'Bob', designation: 'QA', email: 'b@ergo.com' },
        ],
      }) // active employees
      .mockResolvedValueOnce({
        rows: [
          { id: 10, user_id: 2, status: 'present', marked_at: new Date().toISOString() },
        ],
      }) // today records
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // pending corrections

    const res = await request(app)
      .get('/api/attendance/today')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.total_active_employees).toBe(2);
    expect(res.body.stats.present).toBe(1);
    expect(res.body.stats.not_marked).toBe(1);
    expect(res.body.stats.pending_corrections).toBe(2);
    expect(res.body.employees).toHaveLength(2);
  });
});

// =============================================================================
// GET /api/attendance/monthly — Monthly Calendar
// =============================================================================
describe('GET /api/attendance/monthly', () => {
  test('employee views own monthly attendance calendar', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, employee_id: 'EMP001', name: 'Alice' }] }) // emp info
      .mockResolvedValueOnce({ rows: [{ date: '2026-08-15', name: 'Independence Day' }] }) // holidays
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // attendance records

    const res = await request(app)
      .get('/api/attendance/monthly?year=2026&month=8')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.days).toBeDefined();
    expect(res.body.days.length).toBe(31); // August has 31 days
    expect(res.body.summary).toBeDefined();
  });

  test('employee cannot view another employee monthly attendance', async () => {
    const res = await request(app)
      .get('/api/attendance/monthly?year=2026&month=8&user_id=3')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('admin can view any employee monthly attendance by user_id', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, employee_id: 'EMP001', name: 'Alice' }] })
      .mockResolvedValueOnce({ rows: [] }) // holidays
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // attendance

    const res = await request(app)
      .get('/api/attendance/monthly?year=2026&month=8&user_id=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.employee.employee_id).toBe('EMP001');
  });

  test('returns 400 for invalid month parameter', async () => {
    const res = await request(app)
      .get('/api/attendance/monthly?year=2026&month=13')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Attendance Correction Request Workflow
// =============================================================================
describe('POST /api/attendance/:id/correction', () => {
  test('employee requests correction on own attendance record', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }) // exists and owned
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_ATTENDANCE,
          correction_status: 'pending',
          correction_requested_status: 'half_day',
          correction_reason: 'Left early for doctor appointment',
        }],
      }); // UPDATE

    const res = await request(app)
      .post('/api/attendance/10/correction')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({
        requested_status: 'half_day',
        reason: 'Left early for doctor appointment',
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance.correction_status).toBe('pending');
  });

  test('employee cannot request correction on another employee record', async () => {
    query.mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }); // user_id = 2, but caller is user 3

    const res = await request(app)
      .post('/api/attendance/10/correction')
      .set('Authorization', `Bearer ${OTHER_EMP_TOKEN}`)
      .send({
        requested_status: 'travel',
        reason: 'Out on client meeting',
      });

    expect(res.status).toBe(403);
  });

  test('returns 400 if reason is missing', async () => {
    const res = await request(app)
      .post('/api/attendance/10/correction')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ requested_status: 'travel' });

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Admin Correction Review & Overrides
// =============================================================================
describe('Admin: Corrections & Overrides', () => {
  test('admin views all pending corrections', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        user_id: 2,
        date: '2026-08-10',
        current_status: 'present',
        correction_status: 'pending',
        correction_requested_status: 'half_day',
        correction_reason: 'Left early',
        employee_name: 'Alice',
        employee_id: 'EMP001',
      }],
    });

    const res = await request(app)
      .get('/api/attendance/corrections')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.corrections).toHaveLength(1);
  });

  test('employee cannot access admin corrections endpoint', async () => {
    const res = await request(app)
      .get('/api/attendance/corrections')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('admin approves correction request', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          user_id: 2,
          date: '2026-08-10',
          status: 'present',
          correction_status: 'pending',
          correction_requested_status: 'half_day',
          correction_reason: 'Doctor appointment',
        }],
      }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          status: 'half_day',
          correction_status: 'approved',
          is_admin_override: true,
        }],
      }) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put('/api/attendance/10/correction/review')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.attendance.status).toBe('half_day');
    expect(res.body.attendance.correction_status).toBe('approved');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth_audit_log'),
      expect.arrayContaining(['attendance.correction_reviewed'])
    );
  });

  test('admin declines correction request with reason', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          correction_status: 'pending',
        }],
      }) // SELECT
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          correction_status: 'declined',
          correction_declined_reason: 'Insufficient justification provided.',
        }],
      }) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put('/api/attendance/10/correction/review')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        action: 'decline',
        decline_reason: 'Insufficient justification provided.',
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance.correction_status).toBe('declined');
  });

  test('admin decline without reason returns 400', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 10, correction_status: 'pending' }],
      }) // SELECT
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .put('/api/attendance/10/correction/review')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'decline' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reason is required/i);
  });

  test('admin manually overrides attendance record', async () => {
    query
      .mockResolvedValueOnce({ rows: [SAMPLE_ATTENDANCE] }) // existing check
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_ATTENDANCE,
          status: 'travel',
          is_admin_override: true,
          override_reason: 'Client on-site travel confirmed',
        }],
      }); // UPDATE

    const res = await request(app)
      .put('/api/attendance/10/override')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        status: 'travel',
        reason: 'Client on-site travel confirmed',
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance.status).toBe('travel');
    expect(res.body.attendance.is_admin_override).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth_audit_log'),
      expect.arrayContaining(['attendance.overridden'])
    );
  });

  test('employee cannot perform admin override', async () => {
    const res = await request(app)
      .put('/api/attendance/10/override')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ status: 'present', reason: 'Attempt override' });

    expect(res.status).toBe(403);
  });
});
