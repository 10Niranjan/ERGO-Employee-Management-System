-- Migration: 003_create_leave_balances.sql
-- Tracks per-employee, per-leave-type, per-year leave balances.
-- Rows are per calendar year; carry-forward across years (unused balance + fresh
-- allocation) is handled by leaveAccrualService.ensureBalanceRowForCredit at the
-- Dec->Jan boundary — see migration 010_create_leave_accrual.sql.

DROP TRIGGER IF EXISTS leave_balances_updated_at ON leave_balances;

CREATE TABLE IF NOT EXISTS leave_balances (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  leave_type_id INTEGER     NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  -- Calendar year this balance belongs to (e.g. 2025)
  year          INTEGER     NOT NULL,
  allotted      INTEGER     NOT NULL DEFAULT 0 CHECK (allotted >= 0),
  used          INTEGER     NOT NULL DEFAULT 0 CHECK (used >= 0),
  -- Computed as allotted - used; kept as a column for easy querying
  remaining     INTEGER     GENERATED ALWAYS AS (allotted - used) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_leave_balance UNIQUE (user_id, leave_type_id, year)
);

CREATE TRIGGER leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year  ON leave_balances (user_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_balances_type       ON leave_balances (leave_type_id);
