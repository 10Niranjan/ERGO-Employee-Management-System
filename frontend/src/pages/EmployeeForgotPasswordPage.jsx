import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, UserRound } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import { employeeForgotPassword } from '../api/passwordResetApi';

/**
 * Flow 2, step 1 — employee raises a reset request.
 *
 * There is deliberately no self-service path from here: an administrator has
 * to issue the temporary password out-of-band, so the screen ends at a
 * confirmation with nothing further to do.
 */
export default function EmployeeForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await employeeForgotPassword(identifier.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        eyebrow="REQUEST SENT"
        heading="Your admin is on it"
        subtext="You'll be able to log in once your password has been reset."
      >
        <div className="auth-success">
          <span className="auth-success-icon">
            <CheckCircle2 size={28} aria-hidden="true" />
          </span>
          <p className="auth-success-note">
            Your request has been sent to your administrator. They'll generate a
            temporary password and pass it to you directly. When you sign in with
            it, you'll be asked to choose a new password straight away.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="EMPLOYEE RESET"
      heading="Request a password reset"
      subtext="Enter your employee ID or work email and we'll notify your administrator."
      footer={
        <>
          Are you an administrator?{' '}
          <Link to="/admin/forgot-password" className="auth-shell-link">
            Reset with an email code
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="employee-identifier" className="form-label">
            Employee ID or work email
          </label>
          <div className="input-icon-wrapper">
            <UserRound className="input-icon" size={18} aria-hidden="true" />
            <input
              id="employee-identifier"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="EMP001 or you@ergo-asia.co"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="login-submit-btn"
          disabled={loading || !identifier.trim()}
        >
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <>
              Request reset
              <ArrowRight className="btn-arrow" size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
