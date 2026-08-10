'use strict';

const { getMonthDates, isWeekend } = require('../utils/time');

/**
 * Determines the applicable per-day salary rate for a specific date
 * by evaluating the employee's historical salary revision log.
 *
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} currentSalary - Fallback / latest rate
 * @param {Array} salaryHistory - Array of salary_history objects ordered by changed_at ASC
 * @returns {number} The rate applicable on dateStr
 */
function getApplicableSalaryRate(dateStr, currentSalary, salaryHistory = []) {
  if (!salaryHistory || salaryHistory.length === 0) {
    return parseFloat(currentSalary) || 0;
  }

  const targetDate = new Date(`${dateStr}T23:59:59.999+05:30`);

  // Find the last revision that occurred on or before targetDate
  let applicableRate = null;

  for (let i = 0; i < salaryHistory.length; i++) {
    const rev = salaryHistory[i];
    const revDate = new Date(rev.changed_at);

    if (revDate <= targetDate) {
      applicableRate = parseFloat(rev.new_rate);
    } else {
      // If the very first revision happened after targetDate, the rate on targetDate was rev.old_rate
      if (applicableRate === null) {
        applicableRate = parseFloat(rev.old_rate);
      }
      break;
    }
  }

  // If all revisions were before targetDate, the latest new_rate applies (or currentSalary)
  if (applicableRate === null) {
    applicableRate = parseFloat(currentSalary) || 0;
  }

  return Math.round(applicableRate * 100) / 100;
}

/**
 * Pure, deterministic salary computation engine.
 * Computes exact itemized daily payable amounts using the strict priority:
 * 1. Holiday / Weekend (excluded from payable working days)
 * 2. Approved Leave (Paid: 100% rate, Unpaid: 0%)
 * 3. Attendance (Present: 100%, Travel: 100%, Half-Day: 50%, Absent: 0%)
 * 4. No record on working day (Absent: 0%)
 */
async function calculateMonthlySalary(dbClient, userId, year, month) {
  // 1. Fetch employee details
  const { rows: userRows } = await dbClient.query(
    `SELECT id, employee_id, name, designation, email, per_day_salary, date_of_joining, status
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userRows.length === 0) {
    throw new Error(`Employee with ID ${userId} not found.`);
  }
  const employee = userRows[0];
  const currentSalary = parseFloat(employee.per_day_salary) || 0;

  // 2. Fetch salary revision history
  const { rows: salaryHistory } = await dbClient.query(
    `SELECT id, old_rate, new_rate, changed_at
     FROM salary_history
     WHERE user_id = $1
     ORDER BY changed_at ASC`,
    [userId]
  );

  // 3. Month dates
  const monthDates = getMonthDates(year, month);
  const startDate = monthDates[0];
  const endDate = monthDates[monthDates.length - 1];

  // 4. Fetch company holidays in this month
  const { rows: holidays } = await dbClient.query(
    `SELECT date, name FROM holidays
     WHERE date >= $1 AND date <= $2 AND is_active = TRUE`,
    [startDate, endDate]
  );
  const holidayMap = new Map(
    holidays.map((h) => [new Date(h.date).toISOString().slice(0, 10), h.name])
  );

  // 5. Fetch approved leaves for this employee overlapping this month
  const { rows: approvedLeaves } = await dbClient.query(
    `SELECT la.start_date, la.end_date, lt.is_paid, lt.name AS leave_type_name
     FROM leave_applications la
     JOIN leave_types lt ON lt.id = la.leave_type_id
     WHERE la.user_id = $1
       AND la.status = 'approved'
       AND (la.start_date <= $2 AND la.end_date >= $3)`,
    [userId, endDate, startDate]
  );

  // Build map of approved leave per date
  const leaveMap = new Map();
  for (const l of approvedLeaves) {
    const lStart = new Date(l.start_date).toISOString().slice(0, 10);
    const lEnd = new Date(l.end_date).toISOString().slice(0, 10);
    for (const d of monthDates) {
      if (d >= lStart && d <= lEnd) {
        leaveMap.set(d, l);
      }
    }
  }

  // 6. Fetch attendance records in this month
  const { rows: attendanceRows } = await dbClient.query(
    `SELECT date, status, marked_at, is_admin_override
     FROM attendance
     WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, startDate, endDate]
  );
  const attendanceMap = new Map(
    attendanceRows.map((a) => [new Date(a.date).toISOString().slice(0, 10), a])
  );

  // 7. Day-by-day evaluation
  let workingDays = 0;
  let presentDays = 0;
  let halfDays = 0;
  let travelDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let absentDays = 0;
  let holidayCount = 0;
  let weekendCount = 0;
  let totalPayableAmount = 0;

  const days = monthDates.map((d) => {
    const isWeekendDay = isWeekend(d);
    const isHol = holidayMap.has(d);
    const holidayName = holidayMap.get(d) || null;
    const leave = leaveMap.get(d) || null;
    const att = attendanceMap.get(d) || null;

    const rate = getApplicableSalaryRate(d, currentSalary, salaryHistory);

    let status = 'absent';
    let payableFactor = 0;
    let note = '';

    // Precedence 1: Non-working exclusions (Weekend or Holiday)
    if (isHol) {
      holidayCount++;
      status = 'holiday';
      payableFactor = 0;
      note = `Public Holiday: ${holidayName}`;
    } else if (isWeekendDay) {
      weekendCount++;
      status = 'weekend';
      payableFactor = 0;
      note = 'Weekend';
    } else {
      // Working day
      workingDays++;

      // Precedence 2: Approved Leave
      if (leave) {
        if (leave.is_paid) {
          paidLeaveDays++;
          status = 'paid_leave';
          payableFactor = 1.0;
          note = `Approved Paid Leave: ${leave.leave_type_name}`;
        } else {
          unpaidLeaveDays++;
          status = 'unpaid_leave';
          payableFactor = 0;
          note = `Approved Unpaid Leave: ${leave.leave_type_name}`;
        }
      } else if (att) {
        // Precedence 3: Attendance
        if (att.status === 'present') {
          presentDays++;
          status = 'present';
          payableFactor = 1.0;
          note = 'Present (Full Day)';
        } else if (att.status === 'travel') {
          travelDays++;
          status = 'travel';
          payableFactor = 1.0;
          note = 'On Duty / Travel';
        } else if (att.status === 'half_day') {
          halfDays++;
          status = 'half_day';
          payableFactor = 0.5;
          note = 'Half-Day (50% Rate)';
        } else {
          absentDays++;
          status = 'absent';
          payableFactor = 0;
          note = 'Recorded Absent';
        }
      } else {
        // Precedence 4: No record on working day
        absentDays++;
        status = 'absent';
        payableFactor = 0;
        note = 'Unmarked / Absent';
      }
    }

    const dailyAmount = Math.round(rate * payableFactor * 100) / 100;
    totalPayableAmount += dailyAmount;

    return {
      date: d,
      status,
      rate,
      payable_factor: payableFactor,
      daily_amount: dailyAmount,
      note,
    };
  });

  const netSalary = Math.round(totalPayableAmount * 100) / 100;

  return {
    employee: {
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      designation: employee.designation,
      email: employee.email,
      per_day_salary: currentSalary,
    },
    year,
    month,
    summary: {
      total_days: monthDates.length,
      working_days: workingDays,
      present_days: presentDays,
      half_days: halfDays,
      travel_days: travelDays,
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
      absent_days: absentDays,
      holiday_count: holidayCount,
      weekend_count: weekendCount,
      per_day_salary: currentSalary,
      net_salary: netSalary,
    },
    days,
  };
}

module.exports = {
  getApplicableSalaryRate,
  calculateMonthlySalary,
};
