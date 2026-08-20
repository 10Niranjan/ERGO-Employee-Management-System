import axios from 'axios';

/**
 * Axios instance for all backend API calls.
 * Automatically attaches the JWT from localStorage.
 * On 401, clears auth state and redirects to login.
 *
 * baseURL defaults to a relative '/api', which only resolves correctly when
 * frontend and backend share an origin — true in dev via Vite's proxy
 * (vite.config.js), but not once the backend is deployed separately (e.g. to
 * its own Vercel project). Set VITE_API_BASE_URL to the backend's origin
 * (e.g. https://ergo-backend.vercel.app, no trailing /api) wherever that's
 * the case — .env.example already documented this var, nothing previously
 * read it.
 */
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─── Request interceptor — attach token ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor — handle 401 ───────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear storage and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Avoid redirect loops when already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
