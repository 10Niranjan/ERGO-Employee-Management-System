'use strict';

const { query, getClient } = require('../db/pool');
const { getTodayIST, isWeekend, getDayOfWeek, getMonthDates } = require('../utils/time');
const { audit, EVENTS } = require('../services/auditLog');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance
// Mark today's attendance for the logged-in user
// ─────────────────────────────────────────────────────────────────────────────
async function markAttendance(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.body;
    const validStatuses = ['present', 'half_day', 'travel', 'wfh'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Must be 'present', 'half_day', 'travel', or 'wfh'.",
      });
    }

    const todayIST = getTodayIST();

    // Check if attendance already marked for today
    const { rows: existing } = await query(
      'SELECT id, status, marked_at FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, todayIST]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: 'Attendance has already been marked for today.',
        attendance: existing[0],
      });
    }

    // Insert attendance record
    const { rows } = await query(
      `INSERT INTO attendance (user_id, date, status, marked_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, user_id, date, status, marked_at, correction_status, is_admin_override, created_at`,
      [userId, todayIST, status]
    );

    return res.status(201).json({
      message: `Attendance marked as '${status}' successfully.`,
      attendance: rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Attendance has already been marked for today.' });
    }
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/today
// Returns today's attendance & stats (Role aware: Employee prompt info or Admin team stats)
// ─────────────────────────────────────────────────────────────────────────────
async function getTodayAttendance(req, res, next) {
  try {
    const todayIST = getTodayIST();
    const isWeekendDay = isWeekend(todayIST);

    // Check if today is a configured holiday
    const { rows: holidayRows } = await query(
      'SELECT id, name FROM holidays WHERE date = $1 AND is_active = TRUE',
      [todayIST]
    );
    const isHoliday = holidayRows.length > 0;
    const holidayName = isHoliday ? holidayRows[0].name : null;

    if (req.user.role === 'employee') {
      // Employee view
      const { rows: attRows } = await query(
        `SELECT id, user_id, date, status, marked_at, correction_status,
                correction_requested_status, correction_reason, is_admin_override
         FROM attendance
         WHERE user_id = $1 AND date = $2`,
        [req.user.id, todayIST]
      );

      const attendance = attRows.length > 0 ? attRows[0] : null;
      // Should prompt if working day (not weekend, not holiday) and not marked yet
      const shouldPrompt = !attendance && !isWeekendDay && !isHoliday;

      return res.status(200).json({
        date: todayIST,
        day_of_week: getDayOfWeek(todayIST),
        is_weekend: isWeekendDay,
        is_holiday: isHoliday,
        holiday_name: holidayName,
        attendance,
        should_prompt: shouldPrompt,
      });
    }

    // Admin view — Live workforce summary
    const { rows: activeEmployees } = await query(
      `SELECT id, employee_id, name, designation, email
       FROM users
       WHERE role = 'employee' AND status = 'active'
       ORDER BY name ASC`
    );

    const { rows: todayRecords } = await query(
      `SELECT a.id, a.user_id, a.status, a.marked_at, a.is_admin_override,
              a.correction_status, a.correction_requested_status, a.correction_reason
       FROM attendance a
       WHERE a.date = $1`,
      [todayIST]
    );

    const attMap = new Map(todayRecords.map((r) => [r.user_id, r]));

    let presentCount = 0;
    let halfDayCount = 0;
    let travelCount = 0;
    let wfhCount = 0;
    let absentCount = 0;
    let notMarkedCount = 0;

    const employeeList = activeEmployees.map((emp) => {
      const att = attMap.get(emp.id) || null;
      let status = 'not_marked';

      if (att) {
        status = att.status;
        if (status === 'present') presentCount++;
        else if (status === 'half_day') halfDayCount++;
        else if (status === 'travel') travelCount++;
        else if (status === 'wfh') wfhCount++;
        else if (status === 'absent') absentCount++;
      } else {
        notMarkedCount++;
      }

      return {
        ...emp,
        attendance: att,
        current_status: status,
      };
    });

    const { rows: pendingCorrections } = await query(
      "SELECT COUNT(*) AS count FROM attendance WHERE correction_status = 'pending'"
    );

    return res.status(200).json({
      date: todayIST,
      day_of_week: getDayOfWeek(todayIST),
      is_weekend: isWeekendDay,
      is_holiday: isHoliday,
      holiday_name: holidayName,
      stats: {
        total_active_employees: activeEmployees.length,
        present: presentCount,
        half_day: halfDayCount,
        travel: travelCount,
        wfh: wfhCount,
        absent: absentCount,
        not_marked: notMarkedCount,
        pending_corrections: parseInt(pendingCorrections[0].count, 10),
      },
      employees: employeeList,
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/monthly
// Returns full monthly calendar attendance for a user (with weekends and holidays)
// ─────────────────────────────────────────────────────────────────────────────
async function getMonthlyAttendance(req, res, next) {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const year = parseInt(req.query.year, 10) || currentYear;
    const month = parseInt(req.query.month, 10) || currentMonth;

    if (month < 1 || month > 12) {
      return res.status(400).json({ message: 'Month must be between 1 and 12.' });
    }

    // Determine target user
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id, 10);
    } else if (req.user.role !== 'admin' && req.query.user_id) {
      if (parseInt(req.query.user_id, 10) !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your own attendance.' });
      }
    }

    // Fetch employee details
    const { rows: empRows } = await query(
      'SELECT id, employee_id, name, designation, email FROM users WHERE id = $1',
      [targetUserId]
    );
    if (empRows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    const employee = empRows[0];

    // Fetch month dates and holidays
    const monthDates = getMonthDates(year, month);
    const startDate = monthDates[0];
    const endDate = monthDates[monthDates.length - 1];

    const { rows: holidays } = await query(
      'SELECT date, name FROM holidays WHERE date >= $1 AND date <= $2 AND is_active = TRUE',
      [startDate, endDate]
    );
    const holidayMap = new Map(
      holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name])
    );

    // Fetch attendance records for this user in this month
    const { rows: attRows } = await query(
      `SELECT id, user_id, date, status, marked_at,
              correction_status, correction_requested_status, correction_reason,
              correction_declined_reason, correction_requested_at,
              is_admin_override, override_by, override_previous_status, override_reason, override_at
       FROM attendance
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [targetUserId, startDate, endDate]
    );
    const attMap = new Map(
      attRows.map((a) => [new Date(a.date).toISOString().slice(0, 10), a])
    );

    const todayIST = getTodayIST();

    let presentDays = 0;
    let halfDays = 0;
    let travelDays = 0;
    let wfhDays = 0;
    let absentDays = 0;
    let notMarkedDays = 0;
    let weekendDays = 0;
    let holidayDays = 0;
    let totalWorkingDays = 0;

    const days = monthDates.map((dateStr) => {
      const isWeekendDay = isWeekend(dateStr);
      const isHol = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr) || null;
      const att = attMap.get(dateStr) || null;

      let effectiveStatus = 'upcoming';

      if (isHol) {
        holidayDays++;
        effectiveStatus = 'holiday';
      } else if (isWeekendDay) {
        weekendDays++;
        effectiveStatus = 'weekend';
      } else {
        totalWorkingDays++;
        if (att) {
          effectiveStatus = att.status;
          if (att.status === 'present') presentDays++;
          else if (att.status === 'half_day') halfDays++;
          else if (att.status === 'travel') travelDays++;
          else if (att.status === 'wfh') wfhDays++;
          else if (att.status === 'absent') absentDays++;
        } else if (dateStr < todayIST) {
          effectiveStatus = 'not_marked';
          notMarkedDays++;
        } else if (dateStr === todayIST) {
          effectiveStatus = 'not_marked_today';
        }
      }

      return {
        date: dateStr,
        day_of_week: getDayOfWeek(dateStr),
        is_weekend: isWeekendDay,
        is_holiday: isHol,
        holiday_name: holidayName,
        attendance: att,
        effective_status: effectiveStatus,
      };
    });

    return res.status(200).json({
      employee,
      year,
      month,
      summary: {
        total_days: monthDates.length,
        total_working_days: totalWorkingDays,
        present_days: presentDays,
        half_days: halfDays,
        travel_days: travelDays,
        wfh_days: wfhDays,
        absent_days: absentDays,
        not_marked_days: notMarkedDays,
        weekend_days: weekendDays,
        holiday_days: holidayDays,
      },
      days,
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/team (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function getTeamAttendance(req, res, next) {
  try {
    const targetDate = req.query.date || getTodayIST();
    const search = (req.query.search || '').trim();
    const statusFilter = req.query.status;

    let queryStr = `
      SELECT u.id AS user_id, u.employee_id, u.name, u.designation, u.email,
             a.id AS attendance_id, a.date, a.status, a.marked_at,
             a.correction_status, a.correction_requested_status, a.correction_reason,
             a.is_admin_override, a.override_reason, a.override_at
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1
      WHERE u.role = 'employee' AND u.status = 'active'
    `;
    const params = [targetDate];

    if (search) {
      params.push(`%${search}%`);
      queryStr += ` AND (u.name ILIKE $${params.length} OR u.employee_id ILIKE $${params.length} OR u.designation ILIKE $${params.length})`;
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'not_marked') {
        queryStr += ' AND a.status IS NULL';
      } else {
        params.push(statusFilter);
        queryStr += ` AND a.status = $${params.length}`;
      }
    }

    queryStr += ' ORDER BY u.name ASC';

    const { rows } = await query(queryStr, params);

    return res.status(200).json({
      date: targetDate,
      team: rows.map((r) => ({
        user_id: r.user_id,
        employee_id: r.employee_id,
        name: r.name,
        designation: r.designation,
        email: r.email,
        attendance_id: r.attendance_id,
        status: r.status || 'not_marked',
        marked_at: r.marked_at,
        correction_status: r.correction_status || 'none',
        correction_requested_status: r.correction_requested_status,
        correction_reason: r.correction_reason,
        is_admin_override: Boolean(r.is_admin_override),
        override_reason: r.override_reason,
        override_at: r.override_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/:id/correction
// Employee requests correction on an existing attendance record
// ─────────────────────────────────────────────────────────────────────────────
async function requestCorrection(req, res, next) {
  try {
    const { id } = req.params;
    const { requested_status, reason } = req.body;
    const validStatuses = ['present', 'half_day', 'travel', 'wfh', 'absent'];

    if (!validStatuses.includes(requested_status)) {
      return res.status(400).json({
        message: "Invalid requested status. Must be 'present', 'half_day', 'travel', 'wfh', or 'absent'.",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Reason for correction request is required.' });
    }

    // Verify record exists and belongs to logged-in user
    const { rows: existing } = await query(
      'SELECT id, user_id, date, status, correction_status FROM attendance WHERE id = $1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const record = existing[0];
    if (record.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only request corrections for your own attendance.' });
    }

    if (record.correction_status === 'pending') {
      return res.status(409).json({ message: 'A correction request is already pending for this attendance record.' });
    }

    const { rows } = await query(
      `UPDATE attendance
       SET
         correction_status           = 'pending',
         correction_requested_status = $1,
         correction_reason           = $2,
         correction_declined_reason  = NULL,
         correction_requested_at     = NOW(),
         updated_at                  = NOW()
       WHERE id = $3
       RETURNING id, user_id, date, status, correction_status,
                 correction_requested_status, correction_reason, correction_requested_at`,
      [requested_status, reason.trim(), id]
    );

    return res.status(200).json({
      message: 'Correction request submitted successfully.',
      attendance: rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/corrections (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function getCorrections(req, res, next) {
  try {
    const statusFilter = req.query.status || 'pending';
    let whereClause = '';
    const params = [];

    if (statusFilter !== 'all') {
      params.push(statusFilter);
      whereClause = 'WHERE a.correction_status = $1';
    } else {
      whereClause = "WHERE a.correction_status != 'none'";
    }

    const { rows } = await query(
      `SELECT a.id, a.user_id, a.date, a.status AS current_status,
              a.correction_status, a.correction_requested_status, a.correction_reason,
              a.correction_declined_reason, a.correction_requested_at,
              u.name AS employee_name, u.employee_id, u.designation
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       ${whereClause}
       ORDER BY a.correction_requested_at DESC NULLS LAST`,
      params
    );

    return res.status(200).json({ corrections: rows });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/attendance/:id/correction/review (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function reviewCorrection(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { action, decline_reason } = req.body;

    if (!['approve', 'decline'].includes(action)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Action must be 'approve' or 'decline'." });
    }

    const { rows: existing } = await client.query(
      'SELECT id, user_id, date, status, correction_status, correction_requested_status, correction_reason FROM attendance WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const record = existing[0];
    if (record.correction_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Cannot review request with status '${record.correction_status}'.` });
    }

    let updatedRow;

    if (action === 'approve') {
      const { rows } = await client.query(
        `UPDATE attendance
         SET
           status                   = $1,
           correction_status        = 'approved',
           is_admin_override        = TRUE,
           override_by              = $2,
           override_previous_status = $3,
           override_reason          = $4,
           override_at              = NOW(),
           updated_at               = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          record.correction_requested_status,
          req.user.id,
          record.status,
          `Correction approved: ${record.correction_reason || ''}`,
          id,
        ]
      );
      updatedRow = rows[0];
    } else {
      if (!decline_reason || !decline_reason.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'A reason is required when declining a correction request.' });
      }

      const { rows } = await client.query(
        `UPDATE attendance
         SET
           correction_status          = 'declined',
           correction_declined_reason = $1,
           updated_at                 = NOW()
         WHERE id = $2
         RETURNING *`,
        [decline_reason.trim(), id]
      );
      updatedRow = rows[0];
    }

    await client.query('COMMIT');

    await audit({
      event: EVENTS.ATTENDANCE_CORRECTION_REVIEWED,
      actorUserId: req.user.id,
      targetUserId: record.user_id,
      req,
      meta: { attendance_id: parseInt(id, 10), date: record.date, action },
    });

    return res.status(200).json({
      message: `Correction request ${action === 'approve' ? 'approved' : 'declined'} successfully.`,
      attendance: updatedRow,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/attendance/:id/override (Admin only)
// Manual administrative override of an attendance status
// ─────────────────────────────────────────────────────────────────────────────
async function overrideAttendance(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason, user_id, date } = req.body;
    const validStatuses = ['present', 'half_day', 'travel', 'wfh', 'absent'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Status must be 'present', 'half_day', 'travel', 'wfh', or 'absent'.",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Reason for manual override is required.' });
    }

    // Check if updating by ID or upserting for user_id + date
    if (id && id !== 'new') {
      const { rows: existing } = await query(
        'SELECT id, user_id, date, status FROM attendance WHERE id = $1',
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Attendance record not found.' });
      }

      const prev = existing[0];
      const { rows } = await query(
        `UPDATE attendance
         SET
           status                   = $1,
           is_admin_override        = TRUE,
           override_by              = $2,
           override_previous_status = $3,
           override_reason          = $4,
           override_at              = NOW(),
           updated_at               = NOW()
         WHERE id = $5
         RETURNING *`,
        [status, req.user.id, prev.status, reason.trim(), id]
      );

      await audit({
        event: EVENTS.ATTENDANCE_OVERRIDDEN,
        actorUserId: req.user.id,
        targetUserId: prev.user_id,
        req,
        meta: { attendance_id: parseInt(id, 10), date: prev.date, previous_status: prev.status, new_status: status, reason: reason.trim() },
      });

      return res.status(200).json({
        message: 'Attendance overridden successfully.',
        attendance: rows[0],
      });
    }

    // Upsert by user_id and date
    if (!user_id || !date) {
      return res.status(400).json({ message: 'user_id and date are required for new attendance override.' });
    }

    const { rows } = await query(
      `INSERT INTO attendance
         (user_id, date, status, is_admin_override, override_by, override_previous_status, override_reason, override_at)
       VALUES ($1, $2, $3, TRUE, $4, 'not_marked', $5, NOW())
       ON CONFLICT (user_id, date) DO UPDATE
       SET
         status                   = EXCLUDED.status,
         is_admin_override        = TRUE,
         override_by              = EXCLUDED.override_by,
         override_previous_status = attendance.status,
         override_reason          = EXCLUDED.override_reason,
         override_at              = NOW(),
         updated_at               = NOW()
       RETURNING *`,
      [user_id, date, status, req.user.id, reason.trim()]
    );

    await audit({
      event: EVENTS.ATTENDANCE_OVERRIDDEN,
      actorUserId: req.user.id,
      targetUserId: parseInt(user_id, 10),
      req,
      meta: { attendance_id: rows[0].id, date, new_status: status, reason: reason.trim() },
    });

    return res.status(200).json({
      message: 'Attendance overridden successfully.',
      attendance: rows[0],
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  markAttendance,
  getTodayAttendance,
  getMonthlyAttendance,
  getTeamAttendance,
  requestCorrection,
  getCorrections,
  reviewCorrection,
  overrideAttendance,
};
