-- Migration: 012_add_monthly_salary.sql
-- Switches the salary engine from an admin-entered per-day rate to a
-- calendar-days-prorated monthly salary: per-day rate = monthly_salary /
-- actual days in that calendar month (28-31, floats month to month).
--
-- Additive, not destructive:
--   - users.per_day_salary is left in place but deprecated — the app stops
--     reading/writing it going forward. Existing employees' monthly_salary
--     starts at 0 ("not set") and must be re-entered by an admin; a flat
--     rate * N is a guess, not a fact, so no auto-conversion is attempted.
--   - salary_history.old_rate/new_rate are immutable audit rows for past
--     revisions and are never rewritten. New revisions populate the new
--     old_monthly_salary/new_monthly_salary columns instead.
--   - payslips.per_day_salary is repurposed (not replaced) to hold the
--     *derived* per-day rate for that snapshot, shown read-only next to
--     the new monthly_salary column.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.per_day_salary IS
  'Deprecated 2026-08 — replaced by monthly_salary (calendar-days-prorated model). No longer read or written by the app; kept for historical reference only.';

ALTER TABLE salary_history
  ADD COLUMN IF NOT EXISTS old_monthly_salary NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS new_monthly_salary NUMERIC(12, 2);

-- old_rate/new_rate were NOT NULL under the per-day-rate model; new rows
-- populate old_monthly_salary/new_monthly_salary instead and leave these NULL.
ALTER TABLE salary_history
  ALTER COLUMN old_rate DROP NOT NULL,
  ALTER COLUMN new_rate DROP NOT NULL;

COMMENT ON COLUMN salary_history.old_rate IS
  'Deprecated 2026-08 — pre-monthly-salary revisions only. New rows use old_monthly_salary instead.';
COMMENT ON COLUMN salary_history.new_rate IS
  'Deprecated 2026-08 — pre-monthly-salary revisions only. New rows use new_monthly_salary instead.';

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payslips.per_day_salary IS
  'Derived per-day rate for this snapshot (monthly_salary / days in that month), not an admin-entered rate.';
