-- Migration: 006_create_attendance.sql
-- Creates attendance table with correction workflow and admin override audit fields.

DROP TRIGGER IF EXISTS attendance_updated_at ON attendance;

CREATE TABLE IF NOT EXISTS attendance (
  id                          SERIAL PRIMARY KEY,
  user_id                     INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                        DATE          NOT NULL,
  status                      VARCHAR(20)   NOT NULL CHECK (status IN ('present', 'half_day', 'travel', 'absent', 'not_marked')),
  marked_at                   TIMESTAMPTZ,
  
  -- Correction Request fields
  correction_status           VARCHAR(20)   NOT NULL DEFAULT 'none' CHECK (correction_status IN ('none', 'pending', 'approved', 'declined')),
  correction_requested_status VARCHAR(20)   CHECK (correction_requested_status IS NULL OR correction_requested_status IN ('present', 'half_day', 'travel', 'absent')),
  correction_reason           TEXT,
  correction_declined_reason  TEXT,
  correction_requested_at     TIMESTAMPTZ,

  -- Admin Override audit fields
  is_admin_override           BOOLEAN       NOT NULL DEFAULT FALSE,
  override_by                 INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  override_previous_status    VARCHAR(20),
  override_reason             TEXT,
  override_at                 TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_attendance_date UNIQUE (user_id, date)
);

CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_attendance_user_date        ON attendance (user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date             ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_status           ON attendance (status);
CREATE INDEX IF NOT EXISTS idx_attendance_correction_state ON attendance (correction_status);
