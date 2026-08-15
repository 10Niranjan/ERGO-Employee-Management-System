import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CreditCard,
  Menu,
  CheckCircle,
  Globe,
  AlertCircle
} from 'lucide-react';
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
    <div className="login-page">
      {/* ─── LEFT PANEL (Animated Brand Panel) ──────────────────────── */}
      <div className="login-brand-panel">
        
        {/* Animated Mesh Background */}
        <div className="bg-mesh" aria-hidden="true" />
        
        {/* Converging Chevrons Animation */}
        <div className="converge" aria-hidden="true">
          <svg viewBox="0 0 700 900" preserveAspectRatio="xMidYMid slice">
            <path className="chev chev-track" d="M 40,140 Q 260,200 340,420" />
            <path className="chev chev-run c1" d="M 40,140 Q 260,200 340,420" />
            
            <path className="chev chev-track" d="M 660,120 Q 440,220 340,420" />
            <path className="chev chev-run c2" d="M 660,120 Q 440,220 340,420" />
            
            <path className="chev chev-track" d="M 90,760 Q 260,560 340,420" />
            <path className="chev chev-run c3" d="M 90,760 Q 260,560 340,420" />
            
            <circle className="hub-ring" cx="340" cy="420" r="6" />
            <circle className="hub" cx="340" cy="420" r="3.2" />
          </svg>
        </div>

        {/* Floating Widgets */}
        <div className="glass-widget w1">
          <div className="widget-icon red">
            <Menu size={18} strokeWidth={2.5} />
          </div>
          <div className="widget-text">
            <span className="widget-title">Shipment #4821</span>
            <span className="widget-sub">IN TRANSIT &middot; MUMBAI &rarr; ROTTERDAM</span>
          </div>
        </div>

        <div className="glass-widget w2">
          <div className="widget-icon white">
            <CheckCircle size={18} strokeWidth={2.5} />
          </div>
          <div className="widget-text">
            <span className="widget-title">Supplier Audit Passed</span>
            <span className="widget-sub">PUNE FACILITY &middot; TODAY</span>
          </div>
        </div>

        <div className="glass-widget w3">
          <div className="widget-icon red">
            <Globe size={18} strokeWidth={2.5} />
          </div>
          <div className="widget-text">
            <span className="widget-title">3 Regions Live</span>
            <span className="widget-sub">EUROPE &middot; ASIA &middot; USA</span>
          </div>
        </div>

        {/* Content */}
        <div className="brand-panel-content">
          <div className="login-logo-row fade-up-1">
            <div className="login-brand-badge">
              <img
                src="/ergo-logo.jpg"
                alt="ERGO Logo"
                className="login-logo-img"
              />
            </div>
            <span className="login-portal-label">EMPLOYEE PORTAL</span>
          </div>

          <div className="fade-up-2">
            <div className="login-eyebrow">
              <div className="login-eyebrow-line" />
              <span className="login-eyebrow-text">INTERNAL ACCESS</span>
            </div>
            <h1 className="brand-panel-heading">
              Your sourcing office, now <span>one sign-in</span> away.
            </h1>
            <p className="brand-panel-subtext">
              Supplier files, shipment status, and quality reports for the Europe, Asia &amp; USA teams &mdash; all in your workspace.
            </p>
          </div>
        </div>

      </div>

      {/* ─── RIGHT PANEL (Form Panel) ──────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-wrap">
          
          <div className="form-eyebrow">WELCOME BACK</div>
          <h2 className="form-heading">Sign in to your workspace</h2>
          <p className="form-subtext">Use your ERGO employee credentials to continue.</p>

          <form id="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div id="login-error-banner" className="alert alert-error" role="alert" style={{ marginBottom: '8px' }}>
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="identifier" className="form-label">
                Work email
              </label>
              <div className="input-icon-wrapper">
                <Mail className="input-icon" size={18} aria-hidden="true" />
                <input
                  id="identifier"
                  type="email"
                  autoComplete="username"
                  placeholder="you@ergo-asia.co"
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
                <Lock className="input-icon" size={18} aria-hidden="true" />
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
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-options-row">
              <label className="checkbox-label">
                <input type="checkbox" defaultChecked />
                Keep me signed in
              </label>
              <button type="button" className="forgot-link">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || !identifier || !password}
            >
              {loading ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="btn-arrow" size={18} />
                </>
              )}
            </button>
          </form>

          <div className="login-form-footer">
            Trouble signing in? Contact IT support at<br />
            <a href="mailto:it@ergo-asia.co">it@ergo-asia.co</a>
          </div>
        </div>
      </div>
    </div>
  );
}
