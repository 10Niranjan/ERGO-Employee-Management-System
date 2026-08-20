'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes       = require('./routes/authRoutes');
const adminRoutes      = require('./routes/adminRoutes');
const userRoutes       = require('./routes/userRoutes');
const leaveTypeRoutes  = require('./routes/leaveTypeRoutes');
const holidayRoutes    = require('./routes/holidayRoutes');
const salaryRoutes     = require('./routes/salaryRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes      = require('./routes/leaveRoutes');
const reportRoutes     = require('./routes/reportRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate, blockUntilPasswordChanged } = require('./middleware/auth');

const app = express();

// Trust the first hop's X-Forwarded-For (the reverse proxy the README's
// production guidance puts in front of this app — Nginx/Caddy/Cloudflare).
// Without this, express-rate-limit keys off the proxy's IP instead of the
// real client's, so every user shares one rate-limit bucket.
app.set('trust proxy', 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (e.g. server-to-server, Postman in dev)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS policy: origin ${origin} not allowed.`));
    },
    credentials: true,
  })
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── Database health check ────────────────────────────────────────────────────
// Safe: performs a SELECT 1 against the live pool and returns latency.
// No secrets or schema details are exposed in the response.
app.get('/api/db-health', async (_req, res, next) => {
  const { pool } = require('./db/pool');
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      database: 'unreachable',
      message: 'Database connection failed.',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── API routes ─────────────────────────────────────────────────────────────────────────────
// /api/auth is intentionally NOT guarded below — it carries login and the
// password-change endpoints, which a first_login user must still be able to
// reach in order to leave that state.
app.use('/api/auth', authRoutes);

// Every business route is blocked while a password change is outstanding, so
// the mandatory reset screen can't be sidestepped by calling the API directly.
const requirePasswordSettled = [authenticate, blockUntilPasswordChanged];

app.use('/api/admin',       requirePasswordSettled, adminRoutes);
app.use('/api/users',       requirePasswordSettled, userRoutes);
app.use('/api/leave-types', requirePasswordSettled, leaveTypeRoutes);
app.use('/api/holidays',    requirePasswordSettled, holidayRoutes);
app.use('/api/salary',      requirePasswordSettled, salaryRoutes);
app.use('/api/attendance',  requirePasswordSettled, attendanceRoutes);
app.use('/api/leaves',      requirePasswordSettled, leaveRoutes);
app.use('/api/reports',     requirePasswordSettled, reportRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

module.exports = app;
