'use strict';

/**
 * Generates the next sequential Employee ID in the format EMP001, EMP002, …
 * Must be called within an active database transaction to prevent race conditions.
 * @param {import('pg').PoolClient} client - Active DB client (in transaction)
 * @returns {Promise<string>} Next employee ID
 */
async function generateEmployeeId(client) {
  // Lock the users table for this transaction to prevent duplicate IDs
  const { rows } = await client.query(
    `SELECT employee_id
     FROM users
     WHERE employee_id ~ '^EMP[0-9]+$'
     ORDER BY LENGTH(employee_id) DESC, employee_id DESC
     LIMIT 1
     FOR UPDATE`
  );

  if (rows.length === 0) {
    return 'EMP001';
  }

  const last = rows[0].employee_id; // e.g. "EMP007"
  const num = parseInt(last.slice(3), 10); // 7
  const next = num + 1;
  // Pad to at least 3 digits; auto-expands for 4+ digit numbers (e.g. EMP1000)
  return `EMP${String(next).padStart(3, '0')}`;
}

module.exports = { generateEmployeeId };
