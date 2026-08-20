'use strict';

const { Router } = require('express');
const { runLeaveAccrualCron } = require('../controllers/cronController');

const router = Router();

// Auth here is the CRON_SECRET bearer check inside the controller, not a
// user JWT — Vercel Cron calls this with no user session.
router.post('/leave-accrual', runLeaveAccrualCron);

module.exports = router;
