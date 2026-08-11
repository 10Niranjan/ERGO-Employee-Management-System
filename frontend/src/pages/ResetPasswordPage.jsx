import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { resetPasswordApi } from '../api/authApi';
import './ResetPasswordPage.css';

export default function ResetPasswordPage() {
  const { user, updateUser, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** Very lightweight client-side validation before hitting the API */
  function validate() {
    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return 'Password must contain at least one letter and one number.';
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi({ new_password: newPassword });
      // Mark first_login as false in context/localStorage
      updateUser({ first_login: false });
      // Redirect to the appropriate dashboard
      navigate(isAdmin ? '/admin/dashboard' : '/employee/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
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
                placeholder="Min. 8 characters, must include a number"
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

          <ul className="password-requirements text-sm text-muted">
            <li className={newPassword.length >= 8 ? 'met' : ''}>
              At least 8 characters
            </li>
            <li className={/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? 'met' : ''}>
              Contains a letter and a number
            </li>
            <li className={newPassword && newPassword === confirmPassword ? 'met' : ''}>
              Passwords match
            </li>
          </ul>

          <button
            id="reset-password-submit-btn"
            type="submit"
            className="btn btn-primary btn-full reset-btn"
            disabled={loading || !newPassword || !confirmPassword}
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
