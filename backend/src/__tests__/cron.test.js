'use strict';

/**
 * Cron Endpoint Tests
 * POST /api/cron/leave-accrual — Vercel Cron's trigger for the job that runs
 * via in-process node-cron everywhere else. Auth is a shared secret, not a
 * user JWT, so no db/pool mock is needed here — the service call itself is
 * mocked directly.
 */

const request = require('supertest');

jest.mock('../services/leaveAccrualService', () => ({
  runAccrualForMostRecentlyCompletedPeriod: jest.fn(),
}));

const { runAccrualForMostRecentlyCompletedPeriod } = require('../services/leaveAccrualService');
const app = require('../app');

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeAll(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
});

afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/cron/leave-accrual', () => {
  test('returns 401 without the correct bearer secret', async () => {
    const res = await request(app).post('/api/cron/leave-accrual');
    expect(res.status).toBe(401);
    expect(runAccrualForMostRecentlyCompletedPeriod).not.toHaveBeenCalled();
  });

  test('returns 401 with the wrong secret', async () => {
    const res = await request(app)
      .post('/api/cron/leave-accrual')
      .set('Authorization', 'Bearer wrong-secret');
    expect(res.status).toBe(401);
  });

  test('runs the accrual job and returns its summary with the correct secret', async () => {
    runAccrualForMostRecentlyCompletedPeriod.mockResolvedValueOnce({
      period: '2026-07',
      evaluated: 2,
      bonusesAwarded: 1,
    });

    const res = await request(app)
      .post('/api/cron/leave-accrual')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ period: '2026-07', evaluated: 2, bonusesAwarded: 1 });
    expect(runAccrualForMostRecentlyCompletedPeriod).toHaveBeenCalledTimes(1);
  });
});
