import api from './axiosClient';

/**
 * Password-reset API service.
 *
 * Flow 1 (admin)    — self-service reset via a 6-digit email OTP.
 * Flow 2 (employee) — request goes to an admin, who issues a temp password.
 */

// ─── Flow 1: Admin ───────────────────────────────────────────────────────────

/** Request an OTP. Always resolves generically — never reveals if the account exists. */
export async function adminForgotPassword(email) {
  const { data } = await api.post('/auth/admin/forgot-password', { email });
  return data;
}

/** Exchange a correct OTP for a short-lived, single-use reset session token. */
export async function adminVerifyOtp(email, otp) {
  const { data } = await api.post('/auth/admin/verify-otp', { email, otp });
  return data;
}

/** Consume the reset session token and set the new password. */
export async function adminResetPassword(resetSessionToken, newPassword) {
  const { data } = await api.post('/auth/admin/reset-password', {
    reset_session_token: resetSessionToken,
    new_password: newPassword,
  });
  return data;
}

// ─── Flow 2: Employee ────────────────────────────────────────────────────────

/** Raise a reset request for an admin to action. Generic response by design. */
export async function employeeForgotPassword(identifier) {
  const { data } = await api.post('/auth/employee/forgot-password', { identifier });
  return data;
}

/** Mandatory password change after signing in with a temp password. */
export async function forceChangePassword(newPassword) {
  const { data } = await api.post('/auth/employee/force-change-password', {
    new_password: newPassword,
  });
  return data;
}

// ─── Flow 2: Admin-side queue ────────────────────────────────────────────────

export async function listResetRequests(params = {}) {
  const { data } = await api.get('/admin/password-reset-requests', { params });
  return data;
}

/** Issues the temp password. The plaintext is returned exactly once. */
export async function resolveResetRequest(id) {
  const { data } = await api.post(`/admin/password-reset-requests/${id}/resolve`);
  return data;
}
