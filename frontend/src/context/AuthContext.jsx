import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

/**
 * AuthProvider
 * Stores authenticated user + JWT token in memory and localStorage.
 * Provides login(), logout(), and updateUser() helpers.
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  /** Called after a successful login API response */
  const login = useCallback((tokenValue, userData) => {
    localStorage.setItem('token', tokenValue);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(tokenValue);
    setUser(userData);
  }, []);

  /** Clear session — called on logout or 401 */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  /** Partial update of user fields (e.g., after password reset first_login → false) */
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const updated = { ...prev, ...patch };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isAuthenticated = Boolean(token && user);
  const isAdmin = isAuthenticated && user?.role === 'admin';
  const isEmployee = isAuthenticated && user?.role === 'employee';

  const value = useMemo(
    () => ({ token, user, isAuthenticated, isAdmin, isEmployee, login, logout, updateUser }),
    [token, user, isAuthenticated, isAdmin, isEmployee, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to consume auth context */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
