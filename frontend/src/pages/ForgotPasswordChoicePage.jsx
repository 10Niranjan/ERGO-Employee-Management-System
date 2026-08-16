import { Link } from 'react-router-dom';
import { ChevronRight, ShieldCheck, Users } from 'lucide-react';
import AuthShell from '../components/AuthShell';

/**
 * Entry point for both recovery flows.
 *
 * Admins and employees share one login screen, so the "Forgot password?" link
 * lands here and the user picks their own route. Asking outright avoids having
 * the server disclose which accounts are admins — an auto-detecting endpoint
 * would leak exactly that.
 */
export default function ForgotPasswordChoicePage() {
  return (
    <AuthShell
      eyebrow="PASSWORD RECOVERY"
      heading="How do you sign in?"
      subtext="Pick the option that matches your account so we can route your reset correctly."
    >
      <div className="auth-choice-list">
        <Link to="/employee/forgot-password" className="auth-choice-card">
          <span className="auth-choice-icon">
            <Users size={20} aria-hidden="true" />
          </span>
          <span className="auth-choice-text">
            <span className="auth-choice-title">I'm an employee</span>
            <span className="auth-choice-sub">
              Your administrator will issue you a temporary password.
            </span>
          </span>
          <ChevronRight className="auth-choice-arrow" size={18} aria-hidden="true" />
        </Link>

        <Link to="/admin/forgot-password" className="auth-choice-card is-admin">
          <span className="auth-choice-icon">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span className="auth-choice-text">
            <span className="auth-choice-title">I'm an administrator</span>
            <span className="auth-choice-sub">
              We'll email a 6-digit code to your registered work address.
            </span>
          </span>
          <ChevronRight className="auth-choice-arrow" size={18} aria-hidden="true" />
        </Link>
      </div>
    </AuthShell>
  );
}
