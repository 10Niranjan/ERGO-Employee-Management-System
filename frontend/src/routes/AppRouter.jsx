import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/Toast';
import {
  GuestOnly,
  RequireAdmin,
  RequireEmployee,
  RequirePasswordReset,
} from './ProtectedRoutes';

// Layouts
import AdminLayout from '../components/AdminLayout';

// Pages
import LoginPage from '../pages/LoginPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import AdminReportsPage from '../pages/AdminReportsPage';
import AdminAttendancePage from '../pages/AdminAttendancePage';
import AdminLeavesPage from '../pages/AdminLeavesPage';
import EmployeesPage from '../pages/EmployeesPage';
import LeaveTypesPage from '../pages/LeaveTypesPage';
import HolidaysPage from '../pages/HolidaysPage';
import SalaryManagementPage from '../pages/SalaryManagementPage';
import SalaryHistoryPage from '../pages/SalaryHistoryPage';
import EmployeeDashboardPage from '../pages/EmployeeDashboardPage';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* ─── Public (Guest-only) ─────────────────────────────── */}
            <Route
              path="/login"
              element={
                <GuestOnly>
                  <LoginPage />
                </GuestOnly>
              }
            />

            {/* ─── First-login forced password reset ───────────────── */}
            <Route
              path="/reset-password"
              element={
                <RequirePasswordReset>
                  <ResetPasswordPage />
                </RequirePasswordReset>
              }
            />

            {/* ─── Admin routes (wrapped in AdminLayout) ───────────── */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="leaves" element={<AdminLeavesPage />} />
              <Route path="attendance" element={<AdminAttendancePage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="leave-types" element={<LeaveTypesPage />} />
              <Route path="holidays" element={<HolidaysPage />} />
              <Route path="salaries" element={<SalaryManagementPage />} />
              <Route path="salary-history" element={<SalaryHistoryPage />} />
            </Route>

            {/* ─── Employee routes ──────────────────────────────────── */}
            <Route
              path="/employee/dashboard"
              element={
                <RequireEmployee>
                  <EmployeeDashboardPage />
                </RequireEmployee>
              }
            />

            {/* ─── Root redirect ────────────────────────────────────── */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* ─── Catch-all 404 ────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
