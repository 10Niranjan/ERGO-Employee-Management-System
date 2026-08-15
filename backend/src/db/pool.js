'use strict';

const { Pool, types } = require('pg');

// PostgreSQL DATE columns have no time-of-day or timezone component, but pg's default
// parser builds a JS Date from them using local-time semantics. Combined with this app
// forcing process.env.TZ = 'Asia/Kolkata' (see server.js), that silently shifts every
// DATE value back by one calendar day whenever it's later reformatted via
// `new Date(x).toISOString()` — a pattern used throughout the codebase (attendance,
// holidays, leave date ranges, salary calculation). Returning DATE columns as plain
// 'YYYY-MM-DD' strings sidesteps the ambiguity entirely — that's the only form every
// caller actually needs.
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Keep alive idle connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

/**
 * Execute a parameterized query on the pool.
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client from the pool (for transactions).
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
