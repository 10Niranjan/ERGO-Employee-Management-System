import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import PasswordChecklist, { meetsPolicy } from '../components/PasswordChecklist';
import { adminResetPassword } from '../api/passwordResetApi';

/**
 * Flow 1, step 3 — set the new password using the single-use reset session
 * token issued after OTP verification.
 */
export default function AdminResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const resetSessionToken = location.state?.resetSessionToken;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const policyOk = meetsPolicy(password);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = policyOk && matches && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);
    try {
      await adminResetPassword(resetSessionToken, password);
      setDone(true);
      // Give the confirmation a beat to register before bouncing to login.
      setTimeout(() => navigate('/login', { replace: true }), 2600);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Landed here without completing the OTP step.
  if (!resetSessionToken && !done) return <Navigate to="/admin/forgot-password" replace />;

  if (done) {
    return (
      <AuthShell
        eyebrow="ALL SET"
        heading="Password updated"
        subtext="You've been signed out on all devices for security."
        footer={
          <>
            Taking you to sign in…{' '}
            <Link to="/login" className="auth-shell-link">
              Go now
            </Link>
          </>
        }
      >
        <div className="auth-success">
          <span className="auth-success-icon">
            <CheckCircle2 size={28} aria-hidden="true" />
          </span>
          <p className="auth-success-note">
            Your password has been changed and a confirmation email is on its way.
            If you didn't make this change, contact IT immediately.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="ADMINISTRATOR RESET"
      heading="Set a new password"
      subtext="Choose a strong password you haven't used on this account before."
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="new-password" className="form-label">
            New password
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} aria-hidden="true" />
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              placeholder="Enter a new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <PasswordChecklist password={password} />

        <div className="form-group">
          <label htmlFor="confirm-password" className="form-label">
            Confirm new password
          </label>
          <div className="input-icon-wrapper">
            <Lock className="input-icon" size={18} aria-hidden="true" />
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {confirm.length > 0 && !matches && (
            <span className="text-danger" style={{ fontSize: '12.5px', marginTop: '6px' }}>
              Passwords don't match.
            </span>
          )}
        </div>

        <button type="submit" className="login-submit-btn" disabled={!canSubmit}>
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <>
              Reset password
              <ArrowRight className="btn-arrow" size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
