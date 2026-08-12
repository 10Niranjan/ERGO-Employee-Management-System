'use strict';

// Load environment variables first — before any other module uses them.
require('dotenv').config();

// Enforce Asia/Kolkata (IST) timezone for the Node.js process.
// All date-time operations will use IST unless explicitly overridden.
process.env.TZ = 'Asia/Kolkata';

const app = require('./app');
const { pool } = require('./db/pool');
const { startLeaveAccrualScheduler } = require('./jobs/leaveAccrualJob');

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function startServer() {
  // Verify database connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection established.');
  } catch (err) {
    console.error('❌ Failed to connect to the database:', err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log(`   TZ: ${process.env.TZ}`);
  });

  if (process.env.NODE_ENV !== 'test') {
    startLeaveAccrualScheduler();
  }

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      console.log('Database pool closed. Process exiting.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
