import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Mail } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import { adminForgotPassword } from '../api/passwordResetApi';

/**
 * Flow 1, step 1 — admin submits their work email.
 *
 * The API answers identically whether or not the address matches an admin
 * account, so this screen always advances to the code entry step. Behaving
 * differently here would undo the server's anti-enumeration guarantee.
 */
export default function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await adminForgotPassword(email.trim());
      navigate('/admin/verify-otp', { state: { email: email.trim() }, replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="ADMINISTRATOR RESET"
      heading="Verify it's you"
      subtext="Enter your registered work email and we'll send a 6-digit verification code."
      footer={
        <>
          Not an administrator?{' '}
          <Link to="/employee/forgot-password" className="auth-shell-link">
            Request an employee reset
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
          <label htmlFor="admin-reset-email" className="form-label">
            Work email
          </label>
          <div className="input-icon-wrapper">
            <Mail className="input-icon" size={18} aria-hidden="true" />
            <input
              id="admin-reset-email"
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@ergo-asia.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <button type="submit" className="login-submit-btn" disabled={loading || !email.trim()}>
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <>
              Send code
              <ArrowRight className="btn-arrow" size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
