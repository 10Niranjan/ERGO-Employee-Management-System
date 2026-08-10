-- Migration: 008_create_payslips.sql
-- Creates payslips table storing immutable monthly salary snapshots.

DROP TRIGGER IF EXISTS payslips_updated_at ON payslips;

CREATE TABLE IF NOT EXISTS payslips (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month              INTEGER        NOT NULL CHECK (month BETWEEN 1 AND 12),
  year               INTEGER        NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  working_days       INTEGER        NOT NULL DEFAULT 0,
  present_days       INTEGER        NOT NULL DEFAULT 0,
  half_days          INTEGER        NOT NULL DEFAULT 0,
  travel_days        INTEGER        NOT NULL DEFAULT 0,
  paid_leave_days    INTEGER        NOT NULL DEFAULT 0,
  unpaid_leave_days  INTEGER        NOT NULL DEFAULT 0,
  absent_days        INTEGER        NOT NULL DEFAULT 0,
  holiday_count      INTEGER        NOT NULL DEFAULT 0,
  weekend_count      INTEGER        NOT NULL DEFAULT 0,
  per_day_salary     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_salary         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  breakdown          JSONB          NOT NULL DEFAULT '[]'::jsonb,
  generated_by       INTEGER        REFERENCES users(id) ON DELETE SET NULL,
  generated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_payslip_period UNIQUE (user_id, month, year)
);

CREATE TRIGGER payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payslips_user_period ON payslips (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_period      ON payslips (year, month);
