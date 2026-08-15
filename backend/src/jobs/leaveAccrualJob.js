'use strict';

/**
 * Schedules the monthly attendance-bonus accrual job.
 * Runs daily (idempotent, so repeat runs are cheap no-ops) rather than only exactly at
 * midnight on the 1st, so a missed tick (server downtime) self-heals on the next run
 * or the next server boot without needing manual intervention.
 */

const cron = require('node-cron');
const { runAccrualForMostRecentlyCompletedPeriod } = require('../services/leaveAccrualService');

async function runCatchUp(label) {
  try {
    const result = await runAccrualForMostRecentlyCompletedPeriod();
    console.log(
      `[leave-accrual] ${label}: period=${result.period} evaluated=${result.evaluated} bonuses_awarded=${result.bonusesAwarded}`
    );
  } catch (err) {
    console.error(`[leave-accrual] ${label} failed:`, err.message);
  }
}

function startLeaveAccrualScheduler() {
  cron.schedule('0 1 * * *', () => runCatchUp('daily cron'), { timezone: 'Asia/Kolkata' });

  // Also catch up once on boot, in case the daily tick itself was missed during downtime.
  runCatchUp('startup catch-up');
}

module.exports = { startLeaveAccrualScheduler };
