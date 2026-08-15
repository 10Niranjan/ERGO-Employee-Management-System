-- Migration: 007_create_leave_applications.sql
-- Creates leave_applications table to manage the full leave request workflow.

DROP TRIGGER IF EXISTS leave_applications_updated_at ON leave_applications;

CREATE TABLE IF NOT EXISTS leave_applications (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id       INTEGER      NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date          DATE         NOT NULL,
  end_date            DATE         NOT NULL,
  working_days_count  INTEGER      NOT NULL CHECK (working_days_count > 0),
  reason              TEXT         NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  
  -- Reviewer / Audit information
  reviewed_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  admin_notes         TEXT,
  decline_reason      TEXT,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_leave_dates CHECK (start_date <= end_date)
);

CREATE TRIGGER leave_applications_updated_at
  BEFORE UPDATE ON leave_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_leave_apps_user        ON leave_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_leave_apps_status      ON leave_applications (status);
CREATE INDEX IF NOT EXISTS idx_leave_apps_dates       ON leave_applications (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_apps_leave_type  ON leave_applications (leave_type_id);
