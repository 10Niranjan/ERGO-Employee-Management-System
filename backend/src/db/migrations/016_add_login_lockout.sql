-- Migration: 016_add_login_lockout.sql
-- Per-account failed-login tracking for POST /api/auth/login, mirroring the
-- 5-attempt lock already used for admin OTP verification. The existing
-- rate limiter is per-IP only, so a slow, distributed guessing attempt
-- against one specific employee_id isn't caught by it.

ALTER TABLE users
ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN login_locked_until TIMESTAMPTZ;
