import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * RequireAuth
 * Redirects unauthenticated users to /login.
 * Remembers the attempted URL to redirect back after login.
 */
export function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ?? <Outlet />;
}

/**
 * RequireAdmin
 * Allows only users with role === 'admin'.
 * Redirects employees to their dashboard.
 */
export function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/employee/dashboard" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * RequireEmployee
 * Allows both employees and admins (any authenticated user).
 * Redirects unauthenticated users to /login.
 */
export function RequireEmployee({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ?? <Outlet />;
}

/**
 * GuestOnly
 * Redirects already-authenticated users away from login/reset pages.
 */
export function GuestOnly({ children }) {
  const { isAuthenticated, isAdmin, user } = useAuth();

  if (isAuthenticated) {
    // If first_login is still true, they must reset their password
    if (user?.first_login) {
      return <Navigate to="/reset-password" replace />;
    }
    return <Navigate to={isAdmin ? '/admin/dashboard' : '/employee/dashboard'} replace />;
  }

  return children ?? <Outlet />;
}

/**
 * RequirePasswordReset
 * Guards the /reset-password route.
 * Only accessible to authenticated users whose first_login is true.
 */
export function RequirePasswordReset({ children }) {
  const { isAuthenticated, user, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Already reset — redirect to the appropriate dashboard
  if (!user?.first_login) {
    return <Navigate to={isAdmin ? '/admin/dashboard' : '/employee/dashboard'} replace />;
  }

  return children ?? <Outlet />;
}
