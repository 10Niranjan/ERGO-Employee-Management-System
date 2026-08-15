'use strict';

/**
 * Regression guard for a real bug found 2026-08-12: pg's default DATE parser builds a
 * JS Date using local-time semantics, which — combined with this app forcing
 * TZ=Asia/Kolkata — silently shifted every DATE column back by one calendar day
 * whenever reformatted via `new Date(x).toISOString()` (the pattern used throughout
 * attendance, holiday, leave-range, and salary calculations). Confirmed live: an
 * employee with attendance marked 'present' on every working day in June 2026 showed
 * only 77% attendance instead of 100% before this fix.
 */
describe('db/pool DATE type parser', () => {
  test('PostgreSQL DATE columns are returned as plain YYYY-MM-DD strings, not TZ-shifted Date objects', () => {
    require('../db/pool'); // registers the type parser as a side effect on require
    const { types } = require('pg');
    const parseDate = types.getTypeParser(types.builtins.DATE);

    expect(parseDate('2026-06-01')).toBe('2026-06-01');
    // The round-trip that every call site in this codebase relies on:
    expect(new Date(parseDate('2026-06-30')).toISOString().slice(0, 10)).toBe('2026-06-30');
  });
});
