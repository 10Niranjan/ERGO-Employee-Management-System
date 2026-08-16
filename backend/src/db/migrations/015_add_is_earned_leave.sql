-- Migration: 015_add_is_earned_leave.sql
-- Adds an `is_earned_leave` flag to leave_types to indicate which leave type
-- receives the monthly +1 attendance bonus.
-- Enforces that at most one leave type can be the earned leave target.

ALTER TABLE leave_types
ADD COLUMN is_earned_leave BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only ONE leave type can be the earned leave target
CREATE UNIQUE INDEX uq_one_earned_leave 
ON leave_types (is_earned_leave) 
WHERE is_earned_leave = TRUE;

-- Backfill existing "Paid Leave" as the earned leave target if it exists,
-- to preserve backward compatibility.
UPDATE leave_types
SET is_earned_leave = TRUE
WHERE name = 'Paid Leave';
