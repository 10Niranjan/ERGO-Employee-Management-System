import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CalendarCheck,
  Clock4,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginApi } from '../api/authApi';
import ThemeToggle from '../components/ThemeToggle';
import './LoginPage.css';

const FEATURES = [
  { icon: Clock4, text: 'Daily attendance with audited overrides' },
  { icon: CalendarCheck, text: 'Transparent leave approval workflow' },
  { icon: Wallet, text: 'Automated salary computation & payslips' },
];

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
    <div className="login-page">
      {/* Branding panel — hidden on narrow viewports */}
      <div className="login-brand-panel">
        <div className="brand-panel-glow" aria-hidden="true" />
        <div className="brand-panel-grid" aria-hidden="true" />

        <div className="brand-panel-content">
          <div className="login-brand">
            <div className="login-logo" aria-hidden="true">E</div>
            <span className="login-brand-name">Ergo Management</span>
          </div>

          <div className="brand-panel-copy">
            <h2 className="brand-panel-heading">
              Workforce management, without the spreadsheets.
            </h2>
            <p className="brand-panel-subtext">
              One system for attendance, leave, and payroll — built for growing teams.
            </p>
          </div>

          <ul className="brand-feature-list">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="brand-feature-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="brand-panel-footer">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Role-based access, enforced server-side</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="login-form-panel">
        <ThemeToggle className="login-theme-toggle" />
        <div className="login-form-wrap">
          <div className="login-brand login-brand-mobile">
            <div className="login-logo" aria-hidden="true">E</div>
            <span className="login-brand-name">Ergo Management</span>
          </div>

          <div className="login-heading">
            <h1 className="login-title">Welcome back</h1>
            <p className="text-muted text-sm">Sign in to access your HR workspace</p>
          </div>

          <form id="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div id="login-error-banner" className="alert alert-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="identifier" className="form-label">
                Employee ID or Email
              </label>
              <div className="input-icon-wrapper">
                <User className="input-icon" size={17} aria-hidden="true" />
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
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="input-icon-wrapper">
                <Lock className="input-icon" size={17} aria-hidden="true" />
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
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
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
    </div>
  );
}
