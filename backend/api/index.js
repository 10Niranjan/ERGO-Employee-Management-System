'use strict';

// Vercel serverless entry point. Deliberately imports app.js directly, NOT
// server.js — server.js calls app.listen() and starts the in-process
// node-cron scheduler (src/jobs/leaveAccrualJob.js), neither of which make
// sense in a serverless function that Vercel invokes per-request and can
// tear down at any time. The scheduled job runs instead via Vercel Cron
// hitting /api/cron/leave-accrual (see ../vercel.json).
require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';

module.exports = require('../src/app');
