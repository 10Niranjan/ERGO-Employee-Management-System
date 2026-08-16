-- Migration: 014_add_salary_components.sql
-- Adds granular salary component columns to users so an admin can store the
-- full CTC breakdown alongside the monthly_salary figure.
--
-- Earnings: basic, hra, education_allowance, conveyance,
--           professional_development, other_allowance, lta,
--           employer_pf, bonus
-- Deductions: pf_deduction, professional_tax, tds
-- Identity:   pan
--
-- Also adds a components_snapshot JSONB column to salary_history so that
-- every revision logged via the Salary Rates update captures the full
-- component breakdown at that point in time (industry-standard audit trail).

-- ── users table ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS basic                   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hra                     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS education_allowance     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyance              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_development NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowance         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lta                     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_pf             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus                   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_deduction            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_tax        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds                     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pan                     VARCHAR(10);

COMMENT ON COLUMN users.basic                    IS 'Monthly basic pay component';
COMMENT ON COLUMN users.hra                      IS 'House Rent Allowance';
COMMENT ON COLUMN users.education_allowance      IS 'Education Allowance component';
COMMENT ON COLUMN users.conveyance               IS 'Conveyance Allowance';
COMMENT ON COLUMN users.professional_development IS 'Professional Development Allowance';
COMMENT ON COLUMN users.other_allowance          IS 'Other / miscellaneous allowance';
COMMENT ON COLUMN users.lta                      IS 'Leave Travel Allowance';
COMMENT ON COLUMN users.employer_pf              IS 'Employer PF contribution component';
COMMENT ON COLUMN users.bonus                    IS 'Monthly bonus component';
COMMENT ON COLUMN users.pf_deduction             IS 'Employee PF deduction';
COMMENT ON COLUMN users.professional_tax         IS 'Professional Tax deduction';
COMMENT ON COLUMN users.tds                      IS 'TDS deduction';
COMMENT ON COLUMN users.pan                      IS 'Permanent Account Number (PAN) — 10 char alphanumeric';

-- ── salary_history audit trail ───────────────────────────────────────────────
-- Stores the full component snapshot at the time of each salary revision so
-- the audit log shows not just the new monthly total but the full breakdown.
ALTER TABLE salary_history
  ADD COLUMN IF NOT EXISTS components_snapshot JSONB;

COMMENT ON COLUMN salary_history.components_snapshot IS
  'Full salary component breakdown at the time of this revision. Populated by '
  'updateSalaryRate when component fields are saved via the Salary Rates page.';
