-- Migration: 002_create_leave_types.sql
-- Creates the leave_types table and seeds the 4 V1 leave types.

DROP TRIGGER IF EXISTS leave_types_updated_at ON leave_types;

CREATE TABLE IF NOT EXISTS leave_types (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100)  NOT NULL UNIQUE,
  -- TRUE = paid (deducted from quota but salary preserved)
  -- FALSE = unpaid (no quota enforcement, salary deducted)
  is_paid      BOOLEAN       NOT NULL DEFAULT TRUE,
  -- Number of days allotted per employee per calendar year
  yearly_quota INTEGER       NOT NULL DEFAULT 0 CHECK (yearly_quota >= 0),
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_leave_types_is_active ON leave_types (is_active);

-- Seed V1 leave types (idempotent — safe to re-run)
INSERT INTO leave_types (name, is_paid, yearly_quota) VALUES
  ('Casual Leave',  TRUE,  12),
  ('Sick Leave',    TRUE,  6),
  ('Paid Leave',    TRUE,  15),
  ('Unpaid Leave',  FALSE, 0)
ON CONFLICT (name) DO NOTHING;
