'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes       = require('./routes/authRoutes');
const userRoutes       = require('./routes/userRoutes');
const leaveTypeRoutes  = require('./routes/leaveTypeRoutes');
const holidayRoutes    = require('./routes/holidayRoutes');
const salaryRoutes     = require('./routes/salaryRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes      = require('./routes/leaveRoutes');
const reportRoutes     = require('./routes/reportRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

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
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/leave-types', leaveTypeRoutes);
app.use('/api/holidays',    holidayRoutes);
app.use('/api/salary',      salaryRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/leaves',      leaveRoutes);
app.use('/api/reports',     reportRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

module.exports = app;
