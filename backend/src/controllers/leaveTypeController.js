'use strict';

const { query, getClient } = require('../db/pool');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leave-types
// Authenticated — all roles can view leave types (needed for employee leave forms later)
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaveTypes(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === 'true' && req.user.role === 'admin';
    const where = includeInactive ? '' : 'WHERE is_active = TRUE';

    const { rows } = await query(
      `SELECT id, name, is_paid, yearly_quota, is_active, is_earned_leave, created_at, updated_at
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
    const { name, is_paid, yearly_quota, is_earned_leave } = req.body;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Check name uniqueness (case-insensitive)
      const { rows: existing } = await client.query(
        'SELECT id FROM leave_types WHERE LOWER(name) = LOWER($1)',
        [name.trim()]
      );
      if (existing.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'A leave type with this name already exists.' });
      }

      // If this is set as the new earned leave target, clear any existing one first
      if (is_earned_leave) {
        await client.query('UPDATE leave_types SET is_earned_leave = FALSE WHERE is_earned_leave = TRUE');
      }

      const { rows } = await client.query(
        `INSERT INTO leave_types (name, is_paid, yearly_quota, is_earned_leave)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, is_paid, yearly_quota, is_active, is_earned_leave, created_at, updated_at`,
        [name.trim(), Boolean(is_paid), parseInt(yearly_quota, 10) || 0, Boolean(is_earned_leave)]
      );

      await client.query('COMMIT');
      return res.status(201).json({ leave_type: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
    const { name, is_paid, yearly_quota, is_earned_leave } = req.body;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Check the leave type exists
      const { rows: existing } = await client.query(
        'SELECT id, yearly_quota FROM leave_types WHERE id = $1',
        [id]
      );
      if (!existing.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Leave type not found.' });
      }

      // Check name uniqueness if changing name
      if (name) {
        const { rows: nameCheck } = await client.query(
          'SELECT id FROM leave_types WHERE LOWER(name) = LOWER($1) AND id != $2',
          [name.trim(), id]
        );
        if (nameCheck.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'A leave type with this name already exists.' });
        }
      }

      // If this is set as the new earned leave target, clear any existing one first
      if (is_earned_leave === true) {
        await client.query('UPDATE leave_types SET is_earned_leave = FALSE WHERE is_earned_leave = TRUE AND id != $1', [id]);
      }

      // Cascade quota changes to existing leave balances for the current and future years
      if (yearly_quota !== undefined) {
        const newQuota = parseInt(yearly_quota, 10);
        const oldQuota = existing[0].yearly_quota;
        if (newQuota !== oldQuota) {
          const delta = newQuota - oldQuota;
          const currentYear = new Date().getFullYear();
          await client.query(
            `UPDATE leave_balances
             SET allotted = allotted + $1,
                 updated_at = NOW()
             WHERE leave_type_id = $2 AND year >= $3`,
            [delta, id, currentYear]
          );
        }
      }

      const { rows } = await client.query(
        `UPDATE leave_types
         SET
           name            = COALESCE($1, name),
           is_paid         = COALESCE($2, is_paid),
           yearly_quota    = COALESCE($3, yearly_quota),
           is_earned_leave = COALESCE($4, is_earned_leave),
           updated_at      = NOW()
         WHERE id = $5
         RETURNING id, name, is_paid, yearly_quota, is_active, is_earned_leave, created_at, updated_at`,
        [
          name?.trim() || null,
          is_paid !== undefined ? Boolean(is_paid) : null,
          yearly_quota !== undefined ? parseInt(yearly_quota, 10) : null,
          is_earned_leave !== undefined ? Boolean(is_earned_leave) : null,
          id,
        ]
      );

      await client.query('COMMIT');
      return res.status(200).json({ leave_type: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
