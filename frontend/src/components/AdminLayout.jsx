import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardCheck,
  Clock4,
  FileBarChart2,
  History,
  LayoutDashboard,
  LogOut,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import './AdminLayout.css';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const navItems = [
    { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/reports', label: 'Reports & Payroll', icon: FileBarChart2 },
    { to: '/admin/leaves', label: 'Leave Requests', icon: ClipboardCheck },
    { to: '/admin/attendance', label: 'Attendance', icon: Clock4 },
    { to: '/admin/employees', label: 'Employees', icon: Users },
    { to: '/admin/leave-types', label: 'Leave Types', icon: Tags },
    { to: '/admin/holidays', label: 'Holidays', icon: CalendarDays },
    { to: '/admin/salaries', label: 'Salary Rates', icon: Wallet },
    { to: '/admin/salary-history', label: 'Salary History', icon: History },
  ];

  return (
    <div className="admin-app-layout">
      {/* Top Header */}
      <header className="admin-top-header">
        <div className="admin-header-left">
          <div className="admin-brand-icon">E</div>
          <div className="admin-brand-text">
            <span className="brand-name">Ergo Management</span>
            <span className="brand-sub">Admin Portal</span>
          </div>
        </div>

        <div className="admin-header-right">
          <ThemeToggle />
          <div className="user-profile-badge">
            <div className="user-avatar-circle">{user?.name?.charAt(0) || 'A'}</div>
            <div className="user-info-text">
              <span className="user-name">{user?.name}</span>
              <span className="user-meta">{user?.employee_id} • Administrator</span>
            </div>
          </div>
          <button
            type="button"
            id="admin-logout-btn"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
          >
            <LogOut size={14} aria-hidden="true" />
            Log out
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="admin-nav-bar">
        <div className="admin-nav-container">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `admin-nav-tab ${isActive ? 'admin-nav-tab-active' : ''}`
              }
            >
              <span className="nav-tab-icon">
                <item.icon size={16} aria-hidden="true" />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="admin-content-container">
        <Outlet />
      </main>
    </div>
  );
}
