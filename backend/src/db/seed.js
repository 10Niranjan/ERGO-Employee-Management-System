'use strict';

/**
 * Database seeder.
 * Creates the initial Admin user account.
 * Run once after migrations: npm run seed
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

async function seed() {
  const client = await pool.connect();
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

  try {
    // -------------------------------------------------------------------------
    // Admin User
    // -------------------------------------------------------------------------
    const adminEmail = 'admin@ergo.com';
    const adminEmployeeId = 'ADMIN001';
    // Temporary password — user MUST change on first login
    const temporaryPassword = 'Admin@1234';

    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existing.length > 0) {
      console.log(`Admin user already exists (${adminEmail}). Skipping seed.`);
      return;
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, saltRounds);

    await client.query(
      `INSERT INTO users
         (employee_id, role, name, email, password_hash, first_login, status, designation)
       VALUES
         ($1, 'admin', $2, $3, $4, TRUE, 'active', 'System Administrator')`,
      [adminEmployeeId, 'System Admin', adminEmail, passwordHash]
    );

    console.log('');
    console.log('========================================');
    console.log('  Seed complete. Admin account created.');
    console.log('----------------------------------------');
    console.log(`  Employee ID : ${adminEmployeeId}`);
    console.log(`  Email       : ${adminEmail}`);
    console.log(`  Password    : ${temporaryPassword}  (change on first login)`);
    console.log('========================================');
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
