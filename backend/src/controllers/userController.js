'use strict';

const bcrypt = require('bcryptjs');
const { query, getClient } = require('../db/pool');
const { generateEmployeeId } = require('../utils/employeeId');
const { generateTempPassword } = require('../utils/passwordGen');

// Fields returned to callers — password_hash is never included
const SAFE_USER_FIELDS = `
  id, employee_id, role, name, email, phone, designation,
  date_of_joining, per_day_salary, first_login, status,
  created_at, updated_at
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users
// Admin only — paginated list with search and status filter
// ─────────────────────────────────────────────────────────────────────────────
async function getUsers(req, res, next) {
  try {
    const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = req.query.status; // 'active' | 'inactive' | undefined

    const conditions = ["role = 'employee'"]; // admins are not listed here
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(
        `(name ILIKE $${p} OR email ILIKE $${p} OR employee_id ILIKE $${p} OR designation ILIKE $${p})`
      );
    }

    if (status === 'active' || status === 'inactive') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total for pagination
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM users ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Paginated data
    params.push(limit, offset);
    const dataResult = await query(
      `SELECT ${SAFE_USER_FIELDS}
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.status(200).json({
      users: dataResult.rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// Admin only — single employee detail
// ─────────────────────────────────────────────────────────────────────────────
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users
// Admin only — create a new employee
// Returns: { user, temp_password } — temp_password shown ONCE
// ─────────────────────────────────────────────────────────────────────────────
async function createUser(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      name, email, phone, designation,
      date_of_joining, per_day_salary,
    } = req.body;

    // Check email uniqueness
    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'An employee with this email already exists.' });
    }

    // Generate unique employee ID within the transaction
    const employee_id = await generateEmployeeId(client);

    // Generate and hash temporary password
    const tempPassword = generateTempPassword();
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    // Insert user
    const { rows: userRows } = await client.query(
      `INSERT INTO users
         (employee_id, role, name, email, phone, designation,
          date_of_joining, per_day_salary, password_hash, first_login, status)
       VALUES
         ($1, 'employee', $2, $3, $4, $5, $6, $7, $8, TRUE, 'active')
       RETURNING ${SAFE_USER_FIELDS}`,
      [
        employee_id,
        name.trim(),
        email.trim().toLowerCase(),
        phone?.trim() || null,
        designation?.trim() || null,
        date_of_joining || null,
        parseFloat(per_day_salary) || 0,
        passwordHash,
      ]
    );
    const newUser = userRows[0];

    // Initialize leave balances for the current year (IST — server TZ is set)
    const currentYear = new Date().getFullYear();
    const { rows: leaveTypes } = await client.query(
      'SELECT id, yearly_quota FROM leave_types WHERE is_active = TRUE'
    );

    for (const lt of leaveTypes) {
      await client.query(
        `INSERT INTO leave_balances (user_id, leave_type_id, year, allotted, used)
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
        [newUser.id, lt.id, currentYear, lt.yearly_quota]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      user: newUser,
      // temp_password returned ONCE to the admin; never stored in plaintext
      temp_password: tempPassword,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id
// Admin only — update employee details (not password, not role, not employee_id)
// ─────────────────────────────────────────────────────────────────────────────
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name, email, phone, designation,
      date_of_joining, per_day_salary,
    } = req.body;

    // Check the employee exists
    const { rows: existing } = await query(
      'SELECT id, role FROM users WHERE id = $1',
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check email uniqueness if changing
    if (email) {
      const { rows: emailCheck } = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
        [email.trim(), id]
      );
      if (emailCheck.length) {
        return res.status(409).json({ message: 'This email is already used by another employee.' });
      }
    }

    const { rows } = await query(
      `UPDATE users
       SET
         name            = COALESCE($1, name),
         email           = COALESCE(LOWER($2), email),
         phone           = COALESCE($3, phone),
         designation     = COALESCE($4, designation),
         date_of_joining = COALESCE($5, date_of_joining),
         per_day_salary  = COALESCE($6, per_day_salary),
         updated_at      = NOW()
       WHERE id = $7
       RETURNING ${SAFE_USER_FIELDS}`,
      [
        name?.trim() || null,
        email?.trim() || null,
        phone?.trim() ?? null,
        designation?.trim() ?? null,
        date_of_joining || null,
        per_day_salary !== undefined ? parseFloat(per_day_salary) : null,
        id,
      ]
    );

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/:id/status
// Admin only — activate or deactivate without deleting history
// ─────────────────────────────────────────────────────────────────────────────
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: "Status must be 'active' or 'inactive'." });
    }

    // Prevent admin from deactivating themselves
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own status.' });
    }

    const { rows } = await query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${SAFE_USER_FIELDS}`,
      [status, id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, getUserById, createUser, updateUser, updateUserStatus };
