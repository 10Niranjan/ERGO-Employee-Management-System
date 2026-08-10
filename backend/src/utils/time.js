'use strict';

const TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's date in YYYY-MM-DD format based on Asia/Kolkata (IST).
 */
function getTodayIST() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns current hour and minute in Asia/Kolkata (IST).
 */
function getISTHourMinute() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

/**
 * Returns true if current IST time is at or past cutoff (default: 9:00 AM IST).
 * @param {number} cutoffHour - 24hr format, default 9
 * @param {number} cutoffMinute - default 0
 */
function isPastSameDayLeaveCutoff(cutoffHour = 9, cutoffMinute = 0) {
  const { hour, minute } = getISTHourMinute();
  if (hour > cutoffHour) return true;
  if (hour === cutoffHour && minute >= cutoffMinute) return true;
  return false;
}

/**
 * Returns true if the given YYYY-MM-DD date is a Saturday (6) or Sunday (0) in IST.
 * @param {string} dateStr - 'YYYY-MM-DD'
 */
function isWeekend(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = d.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Returns day of week name (e.g. "Monday", "Sunday") for YYYY-MM-DD in IST.
 * @param {string} dateStr - 'YYYY-MM-DD'
 */
function getDayOfWeek(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(d);
}

/**
 * Returns all date strings (YYYY-MM-DD) between startDate and endDate (inclusive).
 * @param {string} startDateStr - 'YYYY-MM-DD'
 * @param {string} endDateStr - 'YYYY-MM-DD'
 * @returns {string[]} Array of date strings
 */
function getDateRange(startDateStr, endDateStr) {
  const dates = [];
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  const cur = new Date(Date.UTC(sYear, sMonth - 1, sDay, 12, 0, 0));
  const end = new Date(Date.UTC(eYear, eMonth - 1, eDay, 12, 0, 0));

  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Returns all date strings (YYYY-MM-DD) for a given year and month (1-12).
 * @param {number} year 
 * @param {number} month - 1 to 12
 * @returns {string[]} Array of date strings
 */
function getMonthDates(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    dates.push(`${year}-${monthStr}-${dayStr}`);
  }
  return dates;
}

module.exports = {
  TIMEZONE,
  getTodayIST,
  getISTHourMinute,
  isPastSameDayLeaveCutoff,
  isWeekend,
  getDayOfWeek,
  getDateRange,
  getMonthDates,
};
