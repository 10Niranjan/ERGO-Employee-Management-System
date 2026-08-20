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

// DB_MAX_CLIENTS matters a lot more than it looks: on a traditional
// always-on server there's one process, so pg's default of 10 (or the 20
// documented in .env.example) is fine. On Vercel each function instance
// opens its own pool, and many can run concurrently — with no cap that
// multiplies into far more Postgres connections than a small managed DB
// (e.g. Neon) allows. Set this low (e.g. 1-5) in Vercel's env vars and point
// DATABASE_URL/DB_HOST at the provider's *pooled* connection endpoint
// (PgBouncer-backed on Neon) rather than raising this number.
const poolConfig = {
  max: parseInt(process.env.DB_MAX_CLIENTS, 10) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS, 10) || 5000,
};

// Every Vercel Postgres Marketplace integration (Neon, Supabase, etc.) injects
// a single DATABASE_URL connection string, not the five discrete DB_* vars
// this app otherwise uses for local dev — prefer it when present so a fresh
// Vercel deployment works without manually splitting that string apart.
// Managed providers also require SSL, which a bare connection string doesn't
// always get pg to negotiate on its own.
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = parseInt(process.env.DB_PORT, 10);
  poolConfig.database = process.env.DB_NAME;
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;
}

const pool = new Pool(poolConfig);

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
