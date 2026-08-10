import api from './axiosClient';

/**
 * Auth API service — wraps all /api/auth/* endpoints.
 */

/**
 * Log in with email/employee_id and password.
 * @param {{ identifier: string, password: string }} credentials
 * @returns {{ token: string, user: object }}
 */
export async function loginApi(credentials) {
  const { data } = await api.post('/auth/login', credentials);
  return data;
}

/**
 * Reset the current user's password (first-login or voluntary reset).
 * @param {{ new_password: string }} payload
 */
export async function resetPasswordApi(payload) {
  const { data } = await api.post('/auth/reset-password', payload);
  return data;
}

/**
 * Fetch the current authenticated user's profile.
 */
export async function getMeApi() {
  const { data } = await api.get('/auth/me');
  return data;
}
