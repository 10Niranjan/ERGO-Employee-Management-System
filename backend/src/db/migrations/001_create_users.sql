-- Migration: 001_create_users.sql
-- Creates the foundational users table for authentication and roles.

-- Enum type for roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'employee');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum type for employee status
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  -- Auto-generated employee ID, e.g. EMP001
  employee_id     VARCHAR(20)  NOT NULL UNIQUE,
  role            user_role    NOT NULL DEFAULT 'employee',
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  phone           VARCHAR(20),
  designation     VARCHAR(100),
  date_of_joining DATE,
  -- Bcrypt-hashed password
  password_hash   TEXT         NOT NULL,
  -- Flags a temporary/first-login password; forces reset on first login
  first_login     BOOLEAN      NOT NULL DEFAULT TRUE,
  status          user_status  NOT NULL DEFAULT 'active',
  -- Per-day salary rate (used in payroll computation)
  per_day_salary  NUMERIC(12, 2) DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for fast lookup by email and employee_id during login
CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users (employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);
