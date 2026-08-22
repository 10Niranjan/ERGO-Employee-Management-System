-- Migration: 017_add_wfh_attendance_status.sql
-- Adds 'wfh' (Work From Home) as a valid attendance status.

ALTER TABLE attendance DROP CONSTRAINT attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'half_day', 'travel', 'wfh', 'absent', 'not_marked'));

ALTER TABLE attendance DROP CONSTRAINT attendance_correction_requested_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_correction_requested_status_check
  CHECK (correction_requested_status IS NULL OR correction_requested_status IN ('present', 'half_day', 'travel', 'wfh', 'absent'));

ALTER TABLE payslips ADD COLUMN wfh_days INTEGER NOT NULL DEFAULT 0;
