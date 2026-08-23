'use strict';

// Vercel serverless entry point. Deliberately imports app.js directly, NOT
// server.js — server.js calls app.listen() and starts the in-process
// node-cron scheduler (src/jobs/leaveAccrualJob.js), neither of which make
// sense in a serverless function that Vercel invokes per-request and can
// tear down at any time. The scheduled job runs instead via Vercel Cron
// hitting /api/cron/leave-accrual (see ../vercel.json).
require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';

const app = require('../src/app');
const { runMigrations } = require('../src/db/migrate');

// Safely execute pending migrations on cold boot in non-test environments
let migrationPromise = null;
if (process.env.NODE_ENV !== 'test') {
  migrationPromise = runMigrations().catch((err) => {
    console.error('[Startup Migration Error]:', err.message);
  });
}

module.exports = async (req, res) => {
  if (migrationPromise) {
    try {
      await migrationPromise;
    } catch (_) {
      // Ignored: failure logged inside runMigrations catch
    }
  }
  return app(req, res);
};
