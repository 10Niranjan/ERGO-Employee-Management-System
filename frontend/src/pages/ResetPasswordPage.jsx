import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { forceChangePassword } from '../api/passwordResetApi';
import PasswordChecklist, { meetsPolicy } from '../components/PasswordChecklist';
import './ResetPasswordPage.css';

/**
 * Mandatory password change.
 *
 * Reached whenever `first_login` is true — on a genuinely new account, and
 * after an admin issues a temporary password in the employee reset flow.
 * RequirePasswordReset gates the route, so it can't be dismissed or navigated
 * away from until a new password is set.
 */
export default function ResetPasswordPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const policyOk = meetsPolicy(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!policyOk) {
      setError('Please satisfy every password requirement below.');
      return;
    }
    if (!matches) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await forceChangePassword(newPassword);
      // Changing the password stamps password_changed_at, which invalidates
      // every token issued before it — including the one we're holding. So we
      // must clear it and re-authenticate rather than continue to a dashboard
      // with a token the server will now reject.
      logout();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="full-page-center reset-bg">
      <div className="reset-card card">
        <div className="reset-header">
          <div className="reset-icon" aria-hidden="true">
            <KeyRound size={22} />
          </div>
          <div>
            <h1 className="reset-title">Set Your Password</h1>
            <p className="text-muted text-sm">
              Welcome, {user?.name}. Please create a new password to continue.
            </p>
          </div>
        </div>

        <form id="reset-password-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div id="reset-error-banner" className="alert alert-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="new-password" className="form-label">
              New Password
            </label>
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={17} aria-hidden="true" />
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Choose a strong new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                id="toggle-new-password"
                className="password-toggle"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password" className="form-label">
              Confirm Password
            </label>
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={17} aria-hidden="true" />
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                id="toggle-confirm-password"
                className="password-toggle"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <PasswordChecklist password={newPassword} />

          {confirmPassword.length > 0 && !matches && (
            <span className="text-danger text-sm">Passwords do not match.</span>
          )}

          <button
            id="reset-password-submit-btn"
            type="submit"
            className="btn btn-primary btn-full reset-btn"
            disabled={loading || !policyOk || !matches}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Updating…' : 'Set Password & Continue'}
          </button>
        </form>

        <p className="text-sm text-muted text-center">
          Want to log in as someone else?{' '}
          <button
            id="logout-from-reset"
            type="button"
            className="link-btn"
            onClick={logout}
          >
            Log out
          </button>
        </p>
      </div>
    </div>
  );
}
