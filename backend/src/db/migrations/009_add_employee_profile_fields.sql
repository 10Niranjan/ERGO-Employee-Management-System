-- Migration: 009_add_employee_profile_fields.sql
-- Adds personal, bank, and emergency contact details captured at onboarding.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender                   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS date_of_birth             DATE,
  ADD COLUMN IF NOT EXISTS address                   TEXT,
  ADD COLUMN IF NOT EXISTS bank_name                 VARCHAR(150),
  ADD COLUMN IF NOT EXISTS bank_account_no            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ifsc_code                 VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact_name     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone    VARCHAR(20);
