-- Migration: 010_create_leave_accrual.sql
-- Auditable leave ledger + monthly attendance-bonus accrual tracking.

-- Every balance-affecting transaction against a user's leave_balances row.
-- allotted-mutating entries (INITIAL_ALLOCATION, ATTENDANCE_BONUS) carry a positive amount;
-- used-mutating entries (LEAVE_TAKEN) carry a positive amount representing days consumed.
CREATE TABLE IF NOT EXISTS leave_ledger (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id      INTEGER      NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year               INTEGER      NOT NULL,
  entry_type         VARCHAR(20)  NOT NULL CHECK (entry_type IN ('INITIAL_ALLOCATION', 'LEAVE_TAKEN', 'ATTENDANCE_BONUS')),
  amount             INTEGER      NOT NULL,
  -- Snapshot of (allotted - used) immediately after this entry was applied
  resulting_balance  INTEGER      NOT NULL,
  -- 'YYYY-MM' — the month this entry relates to (the evaluated month for ATTENDANCE_BONUS); null for INITIAL_ALLOCATION
  period             VARCHAR(7),
  note               TEXT,
  -- Null = system-generated (cron/job); set = admin-triggered manual action
  created_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_user_year ON leave_ledger (user_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_type      ON leave_ledger (entry_type);

-- One row per (user, period) evaluation of the attendance-bonus rule.
-- Doubles as the idempotency guard (unique constraint) and the audit trail for skipped/denied months.
CREATE TABLE IF NOT EXISTS attendance_accrual_runs (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'YYYY-MM' — the month EVALUATED (bonus, if any, is credited to the 1st of the following month)
  period                   VARCHAR(7)   NOT NULL,
  working_days             INTEGER,
  present_equivalent_days  NUMERIC(5,1),
  attendance_pct           NUMERIC(5,2),
  bonus_awarded            BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Set when the month wasn't evaluated at all (joining month, no working days, inactive, balance capped)
  skip_reason              VARCHAR(30),
  leave_ledger_id          INTEGER      REFERENCES leave_ledger(id) ON DELETE SET NULL,
  processed_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_accrual_run UNIQUE (user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_accrual_runs_period ON attendance_accrual_runs (period);

-- Optional cap on accumulated leave balance per leave type. NULL = uncapped (default).
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_balance_cap INTEGER CHECK (max_balance_cap IS NULL OR max_balance_cap >= 0);
