-- Migration: 004_create_holidays.sql
-- National/company holidays managed by the Admin.
-- Weekends are handled at the application layer (not stored here).

DROP TRIGGER IF EXISTS holidays_updated_at ON holidays;

CREATE TABLE IF NOT EXISTS holidays (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  -- Unique constraint prevents duplicate holiday dates
  date       DATE         NOT NULL UNIQUE,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_holidays_date      ON holidays (date);
CREATE INDEX IF NOT EXISTS idx_holidays_year      ON holidays (EXTRACT(YEAR FROM date));
CREATE INDEX IF NOT EXISTS idx_holidays_is_active ON holidays (is_active);
