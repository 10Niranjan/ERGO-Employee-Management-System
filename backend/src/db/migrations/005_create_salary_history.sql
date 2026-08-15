-- Migration: 005_create_salary_history.sql
-- Immutable audit log of every per-day salary change.
-- Records are never updated or deleted; new rows are always inserted.

CREATE TABLE IF NOT EXISTS salary_history (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_rate    NUMERIC(12, 2) NOT NULL,
  new_rate    NUMERIC(12, 2) NOT NULL,
  -- Admin who made the change
  changed_by  INTEGER        NOT NULL REFERENCES users(id),
  -- Optional note from the admin
  note        TEXT,
  changed_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_history_user       ON salary_history (user_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_changed_at ON salary_history (changed_at DESC);
