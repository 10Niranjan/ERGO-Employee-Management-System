-- Migration: 013_add_password_reset_flows.sql
-- Supports the two "Forgot Password" flows:
--   Flow 1 (Admin)    — self-service reset via a 6-digit email OTP
--   Flow 2 (Employee) — admin-mediated reset issuing a one-time temp password
--
-- Note on `must_change_password`: the spec calls for a boolean of that name,
-- but `users.first_login` already carries exactly that meaning and is already
-- wired through login, GuestOnly, RequirePasswordReset and the reset screen.
-- A second column would be a duplicate source of truth for the same state,
-- so the existing `first_login` flag is reused instead.

-- ─── Global session invalidation ────────────────────────────────────────────
-- Auth is stateless JWT with no session store, so "log out of all devices"
-- is implemented by stamping the moment the password last changed and having
-- the authenticate middleware reject any token issued before it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN users.password_changed_at IS
  'Any JWT issued before this instant is rejected by the authenticate middleware. Bumped on every password change to log the user out of all devices.';

-- ─── Flow 1: admin email OTP requests ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_otp_requests (
  id            SERIAL PRIMARY KEY,
  admin_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- HMAC-SHA256 of the 6-digit code. The plaintext OTP is never stored or logged.
  otp_hash      TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER     NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_admin    ON admin_otp_requests (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_otp_expires  ON admin_otp_requests (expires_at);

-- ─── Flow 1: short-lived reset session tokens ───────────────────────────────
-- Issued only after a correct OTP. Scoped strictly to the reset action —
-- this is NOT a login token and is never accepted by the authenticate middleware.
CREATE TABLE IF NOT EXISTS admin_reset_sessions (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 of a 32-byte random token; plaintext is returned to the client once.
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_reset_sessions_hash ON admin_reset_sessions (token_hash);

-- ─── Flow 2: employee password reset requests ───────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id                   SERIAL PRIMARY KEY,
  employee_id          INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'resolved', 'expired')),
  resolved_by_admin_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  -- When the issued temp password stops being usable; the request is then
  -- marked 'expired' and the employee must submit a fresh request.
  temp_expires_at      TIMESTAMPTZ
);

-- At most one pending request per employee — a resubmission surfaces the
-- existing row instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_reset_per_employee
  ON password_reset_requests (employee_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON password_reset_requests (status, requested_at DESC);

-- ─── Password history (blocks reuse of the last N passwords) ────────────────
CREATE TABLE IF NOT EXISTS password_history (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history (user_id, created_at DESC);

-- ─── Auth audit log ─────────────────────────────────────────────────────────
-- Password resets are high-privilege actions and must be fully traceable.
-- `meta` never contains OTPs, tokens or passwords.
CREATE TABLE IF NOT EXISTS auth_audit_log (
  id             SERIAL PRIMARY KEY,
  event          VARCHAR(60) NOT NULL,
  actor_user_id  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  ip             VARCHAR(64),
  user_agent     TEXT,
  meta           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_event  ON auth_audit_log (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_target ON auth_audit_log (target_user_id, created_at DESC);
