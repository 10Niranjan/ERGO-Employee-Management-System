'use strict';

const bcrypt = require('bcryptjs');
const { query, getClient } = require('../db/pool');
const { generateEmployeeId } = require('../utils/employeeId');
const { generateTempPassword } = require('../utils/secureTokens');
const { recordInitialAllocation } = require('../services/leaveAccrualService');
const { audit, EVENTS } = require('../services/auditLog');

// Fields returned to callers — password_hash is never included
const SAFE_USER_FIELDS = `
  id, employee_id, role, name, email, phone, designation,
  date_of_joining, monthly_salary, first_login, status,
  gender, date_of_birth, address, bank_name, bank_account_no,
  ifsc_code, emergency_contact_name, emergency_contact_phone,
  basic, hra, education_allowance, conveyance, professional_development,
  other_allowance, lta, employer_pf, bonus,
  pf_deduction, professional_tax, tds, pan,
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
      date_of_joining, monthly_salary,
      gender, date_of_birth, address,
      bank_name, bank_account_no, ifsc_code,
      emergency_contact_name, emergency_contact_phone,
      // Salary components
      basic, hra, education_allowance, conveyance, professional_development,
      other_allowance, lta, employer_pf, bonus,
      pf_deduction, professional_tax, tds, pan,
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
          date_of_joining, monthly_salary, password_hash, first_login, status,
          gender, date_of_birth, address, bank_name, bank_account_no,
          ifsc_code, emergency_contact_name, emergency_contact_phone,
          basic, hra, education_allowance, conveyance, professional_development,
          other_allowance, lta, employer_pf, bonus,
          pf_deduction, professional_tax, tds, pan)
       VALUES
         ($1, 'employee', $2, $3, $4, $5, $6, $7, $8, TRUE, 'active',
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25,
          $26, $27, $28, $29)
       RETURNING ${SAFE_USER_FIELDS}`,
      [
        employee_id,
        name.trim(),
        email.trim().toLowerCase(),
        phone?.trim() || null,
        designation?.trim() || null,
        date_of_joining || null,
        parseFloat(monthly_salary) || 0,
        passwordHash,
        gender?.trim() || null,
        date_of_birth || null,
        address?.trim() || null,
        bank_name?.trim() || null,
        bank_account_no?.trim() || null,
        ifsc_code?.trim() || null,
        emergency_contact_name?.trim() || null,
        emergency_contact_phone?.trim() || null,
        // Salary components
        parseFloat(basic) || 0,
        parseFloat(hra) || 0,
        parseFloat(education_allowance) || 0,
        parseFloat(conveyance) || 0,
        parseFloat(professional_development) || 0,
        parseFloat(other_allowance) || 0,
        parseFloat(lta) || 0,
        parseFloat(employer_pf) || 0,
        parseFloat(bonus) || 0,
        parseFloat(pf_deduction) || 0,
        parseFloat(professional_tax) || 0,
        parseFloat(tds) || 0,
        pan?.trim().toUpperCase() || null,
      ]
    );
    const newUser = userRows[0];

    // Initialize leave balances for the current year (IST — server TZ is set)
    const currentYear = new Date().getFullYear();
    const { rows: leaveTypes } = await client.query(
      'SELECT id, name, is_paid, yearly_quota FROM leave_types WHERE is_active = TRUE'
    );

    for (const lt of leaveTypes) {
      let allotted = lt.yearly_quota;

      const { rows: inserted } = await client.query(
        `INSERT INTO leave_balances (user_id, leave_type_id, year, allotted, used)
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT (user_id, leave_type_id, year) DO NOTHING
         RETURNING id`,
        [newUser.id, lt.id, currentYear, allotted]
      );
      if (inserted.length) {
        await recordInitialAllocation(client, {
          userId: newUser.id, leaveTypeId: lt.id, year: currentYear, allotted,
          note: `Base allocation ${allotted}`,
        });
      }
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
      date_of_joining, monthly_salary,
      // Salary components
      basic, hra, education_allowance, conveyance, professional_development,
      other_allowance, lta, employer_pf, bonus,
      pf_deduction, professional_tax, tds, pan,
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
         name                    = COALESCE($1, name),
         email                   = COALESCE(LOWER($2), email),
         phone                   = COALESCE($3, phone),
         designation             = COALESCE($4, designation),
         date_of_joining         = COALESCE($5, date_of_joining),
         monthly_salary          = COALESCE($6, monthly_salary),
         basic                   = COALESCE($7, basic),
         hra                     = COALESCE($8, hra),
         education_allowance     = COALESCE($9, education_allowance),
         conveyance              = COALESCE($10, conveyance),
         professional_development= COALESCE($11, professional_development),
         other_allowance         = COALESCE($12, other_allowance),
         lta                     = COALESCE($13, lta),
         employer_pf             = COALESCE($14, employer_pf),
         bonus                   = COALESCE($15, bonus),
         pf_deduction            = COALESCE($16, pf_deduction),
         professional_tax        = COALESCE($17, professional_tax),
         tds                     = COALESCE($18, tds),
         pan                     = COALESCE(UPPER($19), pan),
         updated_at              = NOW()
       WHERE id = $20
       RETURNING ${SAFE_USER_FIELDS}`,
      [
        name?.trim() || null,
        email?.trim() || null,
        phone?.trim() ?? null,
        designation?.trim() ?? null,
        date_of_joining || null,
        monthly_salary !== undefined ? parseFloat(monthly_salary) : null,
        basic       !== undefined ? parseFloat(basic)        : null,
        hra         !== undefined ? parseFloat(hra)          : null,
        education_allowance      !== undefined ? parseFloat(education_allowance)      : null,
        conveyance               !== undefined ? parseFloat(conveyance)               : null,
        professional_development !== undefined ? parseFloat(professional_development) : null,
        other_allowance          !== undefined ? parseFloat(other_allowance)          : null,
        lta                      !== undefined ? parseFloat(lta)                      : null,
        employer_pf              !== undefined ? parseFloat(employer_pf)              : null,
        bonus                    !== undefined ? parseFloat(bonus)                    : null,
        pf_deduction             !== undefined ? parseFloat(pf_deduction)             : null,
        professional_tax         !== undefined ? parseFloat(professional_tax)         : null,
        tds                      !== undefined ? parseFloat(tds)                      : null,
        pan?.trim() || null,
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

    await audit({
      event: EVENTS.USER_STATUS_CHANGED,
      actorUserId: req.user.id,
      targetUserId: rows[0].id,
      req,
      meta: { employee_id: rows[0].employee_id, new_status: status },
    });

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id
// Admin only — permanently removes an employee and all their history
// (attendance, leave, payslips, salary revisions cascade via ON DELETE CASCADE).
// Scoped to role = 'employee' so an admin account can never be deleted here.
// ─────────────────────────────────────────────────────────────────────────────
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `DELETE FROM users WHERE id = $1 AND role = 'employee' RETURNING employee_id, name`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // No targetUserId here — the row is already gone, and target_user_id has
    // an FK into users(id), so inserting a now-nonexistent id would just fail
    // silently (audit() swallows errors). The deleted id lives in meta instead.
    await audit({
      event: EVENTS.USER_DELETED,
      actorUserId: req.user.id,
      req,
      meta: { deleted_user_id: parseInt(id, 10), employee_id: rows[0].employee_id, name: rows[0].name },
    });

    return res.status(200).json({
      message: `Employee ${rows[0].employee_id} (${rows[0].name}) permanently deleted.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, getUserById, createUser, updateUser, updateUserStatus, deleteUser };
