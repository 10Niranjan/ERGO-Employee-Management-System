'use strict';

const { query } = require('../db/pool');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leave-types
// Authenticated — all roles can view leave types (needed for employee leave forms later)
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaveTypes(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === 'true' && req.user.role === 'admin';
    const where = includeInactive ? '' : 'WHERE is_active = TRUE';

    const { rows } = await query(
      `SELECT id, name, is_paid, yearly_quota, is_active, created_at, updated_at
       FROM leave_types
       ${where}
       ORDER BY name ASC`
    );
    return res.status(200).json({ leave_types: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leave-types
// Admin only — create a new leave type
// ─────────────────────────────────────────────────────────────────────────────
async function createLeaveType(req, res, next) {
  try {
    const { name, is_paid, yearly_quota } = req.body;

    // Check name uniqueness (case-insensitive)
    const { rows: existing } = await query(
      'SELECT id FROM leave_types WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'A leave type with this name already exists.' });
    }

    const { rows } = await query(
      `INSERT INTO leave_types (name, is_paid, yearly_quota)
       VALUES ($1, $2, $3)
       RETURNING id, name, is_paid, yearly_quota, is_active, created_at, updated_at`,
      [name.trim(), Boolean(is_paid), parseInt(yearly_quota, 10) || 0]
    );

    return res.status(201).json({ leave_type: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/leave-types/:id
// Admin only — update leave type name, paid status, or quota
// ─────────────────────────────────────────────────────────────────────────────
async function updateLeaveType(req, res, next) {
  try {
    const { id } = req.params;
    const { name, is_paid, yearly_quota } = req.body;

    // Check the leave type exists
    const { rows: existing } = await query(
      'SELECT id FROM leave_types WHERE id = $1',
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }

    // Check name uniqueness if changing name
    if (name) {
      const { rows: nameCheck } = await query(
        'SELECT id FROM leave_types WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name.trim(), id]
      );
      if (nameCheck.length) {
        return res.status(409).json({ message: 'A leave type with this name already exists.' });
      }
    }

    const { rows } = await query(
      `UPDATE leave_types
       SET
         name          = COALESCE($1, name),
         is_paid       = COALESCE($2, is_paid),
         yearly_quota  = COALESCE($3, yearly_quota),
         updated_at    = NOW()
       WHERE id = $4
       RETURNING id, name, is_paid, yearly_quota, is_active, created_at, updated_at`,
      [
        name?.trim() || null,
        is_paid !== undefined ? Boolean(is_paid) : null,
        yearly_quota !== undefined ? parseInt(yearly_quota, 10) : null,
        id,
      ]
    );

    return res.status(200).json({ leave_type: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/leave-types/:id/status
// Admin only — activate or deactivate a leave type
// ─────────────────────────────────────────────────────────────────────────────
async function toggleLeaveTypeStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: "'is_active' must be a boolean." });
    }

    const { rows } = await query(
      `UPDATE leave_types
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, is_paid, yearly_quota, is_active, created_at, updated_at`,
      [is_active, id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Leave type not found.' });
    }

    return res.status(200).json({ leave_type: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveTypeStatus };
