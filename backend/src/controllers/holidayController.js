'use strict';

const { query } = require('../db/pool');

// Helper: parse a date string and validate it's a real date (IST context)
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  // Return as ISO date string (YYYY-MM-DD)
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/holidays
// Authenticated — filter by year (defaults to current year in IST)
// ─────────────────────────────────────────────────────────────────────────────
async function getHolidays(req, res, next) {
  try {
    const currentYear = new Date().getFullYear();
    const year = parseInt(req.query.year, 10) || currentYear;

    // Admin can see inactive holidays too; employees see only active
    const activeOnly = req.user.role !== 'admin';

    const { rows } = await query(
      `SELECT id, name, date, is_active, created_at, updated_at
       FROM holidays
       WHERE EXTRACT(YEAR FROM date) = $1
         ${activeOnly ? 'AND is_active = TRUE' : ''}
       ORDER BY date ASC`,
      [year]
    );

    return res.status(200).json({ holidays: rows, year });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/holidays
// Admin only — add a new holiday; duplicate dates are rejected
// ─────────────────────────────────────────────────────────────────────────────
async function createHoliday(req, res, next) {
  try {
    const { name, date } = req.body;

    const parsedDate = parseDate(date);
    if (!parsedDate) {
      return res.status(400).json({ message: 'Invalid or missing date.' });
    }

    // Uniqueness is enforced at DB level; catch the specific PG error code
    try {
      const { rows } = await query(
        `INSERT INTO holidays (name, date)
         VALUES ($1, $2)
         RETURNING id, name, date, is_active, created_at, updated_at`,
        [name.trim(), parsedDate]
      );
      return res.status(201).json({ holiday: rows[0] });
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        // unique_violation — date already exists
        return res.status(409).json({
          message: `A holiday already exists on ${parsedDate}. Please choose a different date.`,
        });
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/holidays/:id
// Admin only — update holiday name or date
// ─────────────────────────────────────────────────────────────────────────────
async function updateHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const { name, date } = req.body;

    const parsedDate = date ? parseDate(date) : undefined;
    if (date && !parsedDate) {
      return res.status(400).json({ message: 'Invalid date format.' });
    }

    try {
      const { rows } = await query(
        `UPDATE holidays
         SET
           name       = COALESCE($1, name),
           date       = COALESCE($2, date),
           updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, date, is_active, created_at, updated_at`,
        [name?.trim() || null, parsedDate || null, id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: 'Holiday not found.' });
      }
      return res.status(200).json({ holiday: rows[0] });
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        return res.status(409).json({
          message: `A holiday already exists on ${parsedDate}. Please choose a different date.`,
        });
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/holidays/:id
// Admin only — hard delete (holiday dates are not part of historical records)
// ─────────────────────────────────────────────────────────────────────────────
async function deleteHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const { rowCount } = await query(
      'DELETE FROM holidays WHERE id = $1',
      [id]
    );

    if (!rowCount) {
      return res.status(404).json({ message: 'Holiday not found.' });
    }
    return res.status(200).json({ message: 'Holiday deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHolidays, createHoliday, updateHoliday, deleteHoliday };
