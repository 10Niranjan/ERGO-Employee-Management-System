import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import '../pages/LoginPage.css';
import './AuthShell.css';

/**
 * Split-screen shell for the password-reset screens.
 *
 * Reuses the login page's own layout classes (.login-page, .login-brand-panel,
 * .login-form-panel …) so these screens inherit the ERGO navy/red design
 * system, fonts and focus states for free and stay in step if the login page
 * is restyled again.
 *
 * The login page's floating shipment widgets and chevron animation are
 * deliberately left out — a security flow should read as calm and focused,
 * not busy.
 */
export default function AuthShell({ eyebrow, heading, subtext, children, footer }) {
  return (
    <div className="login-page auth-shell">
      {/* ─── Brand panel ─────────────────────────────────────────── */}
      <div className="login-brand-panel">
        <div className="bg-mesh" aria-hidden="true" />

        <div className="brand-panel-content">
          <div className="login-logo-row fade-up-1">
            <div className="login-brand-badge">
              <img src="/ergo-logo.jpg" alt="ERGO Logo" className="login-logo-img" />
            </div>
            <span className="login-portal-label">EMPLOYEE PORTAL</span>
          </div>

          <div className="fade-up-2">
            <div className="login-eyebrow">
              <div className="login-eyebrow-line" />
              <span className="login-eyebrow-text">ACCOUNT RECOVERY</span>
            </div>
            <h1 className="brand-panel-heading">
              Locked out? <span>Let's fix that.</span>
            </h1>
            <p className="brand-panel-subtext">
              Password recovery for the Europe, Asia &amp; USA teams — verified,
              audited, and back in your workspace in a couple of minutes.
            </p>
          </div>
        </div>

        <div className="auth-shell-assurance fade-up-3">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Every reset is logged and verified</span>
        </div>
      </div>

      {/* ─── Form panel ──────────────────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-wrap">
          {eyebrow && <div className="form-eyebrow">{eyebrow}</div>}
          {heading && <h2 className="form-heading">{heading}</h2>}
          {subtext && <p className="form-subtext">{subtext}</p>}

          {children}

          <div className="login-form-footer">
            {footer ?? (
              <>
                Remembered it?{' '}
                <Link to="/login" className="auth-shell-link">
                  Back to sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
