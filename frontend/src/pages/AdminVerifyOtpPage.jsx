import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Timer } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import { adminForgotPassword, adminVerifyOtp } from '../api/passwordResetApi';

const OTP_LENGTH = 6;
const CODE_TTL_SECONDS = 5 * 60;   // must match OTP_TTL_MINUTES on the server
const RESEND_COOLDOWN_SECONDS = 60;

/** mm:ss */
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Flow 1, step 2 — enter the 6-digit code.
 *
 * Six separate boxes with auto-advancing focus, full paste support, a live
 * countdown to expiry, and a resend link that stays disabled until its
 * cooldown elapses.
 */
export default function AdminVerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const inputsRef = useRef([]);

  // One interval drives both counters so they can't drift apart.
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const code = digits.join('');
  const expired = secondsLeft === 0;

  const submitCode = useCallback(
    async (value) => {
      setError('');
      setLoading(true);
      try {
        const data = await adminVerifyOtp(email, value);
        navigate('/admin/reset-password', {
          state: { resetSessionToken: data.reset_session_token, email },
          replace: true,
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Something went wrong. Please try again.');
        setDigits(Array(OTP_LENGTH).fill(''));
        inputsRef.current[0]?.focus();
      } finally {
        setLoading(false);
      }
    },
    [email, navigate]
  );

  function setDigitAt(index, value) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index, rawValue) {
    const value = rawValue.replace(/\D/g, '');
    if (!value) {
      setDigitAt(index, '');
      return;
    }

    // Typing over a filled box, or a mobile keyboard delivering several
    // characters at once, spills into the following boxes.
    if (value.length > 1) {
      handlePasteValue(value, index);
      return;
    }

    setDigitAt(index, value);
    setError('');
    if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handlePasteValue(pasted, startIndex = 0) {
    const clean = pasted.replace(/\D/g, '').slice(0, OTP_LENGTH - startIndex);
    if (!clean) return;

    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < clean.length; i++) next[startIndex + i] = clean[i];
      return next;
    });
    setError('');

    const landing = Math.min(startIndex + clean.length, OTP_LENGTH - 1);
    inputsRef.current[landing]?.focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      // Clear this box if it has a value, otherwise step back and clear that one.
      if (digits[index]) {
        setDigitAt(index, '');
      } else if (index > 0) {
        setDigitAt(index - 1, '');
        inputsRef.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
      e.preventDefault();
    }
  }

  async function handleResend() {
    setError('');
    setDigits(Array(OTP_LENGTH).fill(''));
    try {
      await adminForgotPassword(email);
      setSecondsLeft(CODE_TTL_SECONDS);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the code. Please try again.');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (code.length === OTP_LENGTH && !expired) submitCode(code);
  }

  // Reached directly without going through step 1 — no email to verify against.
  if (!email) return <Navigate to="/admin/forgot-password" replace />;

  return (
    <AuthShell
      eyebrow="ADMINISTRATOR RESET"
      heading="Enter your code"
      subtext="We've sent a 6-digit verification code to your registered work email."
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="otp-sent-to">
          Code sent to <strong>{email}</strong>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="otp-0">
            Verification code
          </label>
          <div className={`otp-input-row ${error ? 'is-error' : ''}`}>
            {digits.map((digit, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                ref={(el) => { inputsRef.current[i] = el; }}
                className={`otp-box ${digit ? 'is-filled' : ''} ${error ? 'is-error' : ''}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => {
                  e.preventDefault();
                  handlePasteValue(e.clipboardData.getData('text'), i);
                }}
                onFocus={(e) => e.target.select()}
                disabled={loading || expired}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
              />
            ))}
          </div>
        </div>

        <div className="otp-meta-row">
          <span
            className={`otp-countdown ${expired ? 'is-expired' : secondsLeft <= 30 ? 'is-urgent' : ''}`}
          >
            <Timer size={14} aria-hidden="true" />
            {expired ? 'Code expired' : `Expires in ${formatTime(secondsLeft)}`}
          </span>

          <button
            type="button"
            className="otp-resend-btn"
            onClick={handleResend}
            disabled={resendIn > 0}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
        </div>

        <button
          type="submit"
          className="login-submit-btn"
          disabled={loading || expired || code.length !== OTP_LENGTH}
        >
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <>
              Verify code
              <ArrowRight className="btn-arrow" size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
