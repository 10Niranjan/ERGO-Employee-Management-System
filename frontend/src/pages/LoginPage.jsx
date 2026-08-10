import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginApi } from '../api/authApi';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { token, user } = await loginApi({ identifier: identifier.trim(), password });
      login(token, user);

      // First-login: force password reset regardless of role
      if (user.first_login) {
        navigate('/reset-password', { replace: true });
        return;
      }

      // Redirect to intended page or role-based dashboard
      const from = location.state?.from?.pathname;
      if (from && from !== '/login' && from !== '/reset-password') {
        navigate(from, { replace: true });
      } else {
        navigate(user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard', {
          replace: true,
        });
      }
    } catch (err) {
      const message =
        err.response?.data?.message || 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="full-page-center login-bg">
      <div className="login-card card">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">E</div>
          <div>
            <h1 className="login-title">Ergo Management</h1>
            <p className="text-muted text-sm">Employee Management System</p>
          </div>
        </div>

        <form id="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div id="login-error-banner" className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="identifier" className="form-label">
              Employee ID or Email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="EMP001 or you@ergo.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                id="toggle-password-visibility"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="btn btn-primary btn-full login-btn"
            disabled={loading || !identifier || !password}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer text-muted text-sm">
          Trouble logging in? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
