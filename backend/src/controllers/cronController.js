'use strict';

const { runAccrualForMostRecentlyCompletedPeriod } = require('../services/leaveAccrualService');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/leave-accrual
// Triggered by Vercel Cron (see vercel.json) instead of the in-process
// node-cron scheduler used by server.js — there's no long-lived process on
// Vercel to hold that schedule. Idempotent: safe to trigger more than once
// for the same period, which is what makes catch-up after downtime free.
// ─────────────────────────────────────────────────────────────────────────────
async function runLeaveAccrualCron(req, res, next) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const result = await runAccrualForMostRecentlyCompletedPeriod();
    console.log(
      `[leave-accrual] cron: period=${result.period} evaluated=${result.evaluated} bonuses_awarded=${result.bonusesAwarded}`
    );
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { runLeaveAccrualCron };
