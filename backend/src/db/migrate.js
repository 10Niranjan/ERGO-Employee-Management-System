'use strict';

/**
 * Migration runner.
 * Runs all SQL migration files in order.
 * Tracks executed migrations in a `schema_migrations` table.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(customPool = pool) {
  const client = await customPool.connect();

  try {
    // Ensure the tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-executed migrations
    const { rows: executed } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename ASC'
    );
    const executedSet = new Set(executed.map((r) => r.filename));

    // Read all migration files, sorted ascending
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    const appliedFiles = [];
    for (const file of files) {
      if (executedSet.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  [run]  ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        ran++;
        appliedFiles.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed on ${file}: ${err.message}`);
      }
    }

    if (ran > 0) {
      console.log(`Migrations complete. ${ran} new migration(s) applied.`);
    }
    return { applied: ran, files: appliedFiles };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then((res) => {
      console.log(`Finished migrations. Applied: ${res.applied}`);
      return pool.end();
    })
    .catch((err) => {
      console.error('Migration error:', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations, migrate: runMigrations };
