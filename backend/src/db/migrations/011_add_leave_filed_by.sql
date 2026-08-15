-- Migration: 011_add_leave_filed_by.sql
-- Tracks admin-on-behalf-of leave filings (e.g. backdated leave an admin files
-- and auto-approves for an employee). NULL = employee self-filed (normal case).

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS filed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leave_apps_filed_by ON leave_applications (filed_by);
