import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardCheck,
  Clock4,
  FileBarChart2,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Tags,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import './AdminLayout.css';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

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
    { to: '/admin/password-resets', label: 'Password Resets', icon: KeyRound },
    { to: '/admin/leave-types', label: 'Leave Types', icon: Tags },
    { to: '/admin/holidays', label: 'Holidays', icon: CalendarDays },
    { to: '/admin/salaries', label: 'Salary Rates', icon: Wallet },
    { to: '/admin/salary-history', label: 'Salary History', icon: History },
  ];

  return (
    <div className="admin-app-layout">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Vertical Sidebar */}
      <aside
        className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}
        aria-label="Admin Navigation"
      >
        {/* Sidebar Brand Header */}
        <div className="admin-sidebar-header">
          <div className="admin-brand-left">
            <img
              src="/ergo-logo.jpg"
              alt="ERGO Logo"
              className="admin-sidebar-logo"
            />
          </div>

          <button
            type="button"
            className="admin-sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar navigation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="admin-sidebar-nav">
          <div className="admin-nav-section-title">Navigation</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sidebar-link-icon">
                <item.icon size={18} aria-hidden="true" />
              </span>
              <span className="sidebar-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer">
          <div className="sidebar-user-brief">
            <div className="user-avatar-circle">{user?.name?.charAt(0) || 'A'}</div>
            <div className="user-info-text">
              <span className="user-name">{user?.name}</span>
              <span className="user-meta">{user?.employee_id} • Admin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area (Right of fixed sidebar) */}
      <div className="admin-main-wrapper">
        {/* Top Header */}
        <header className="admin-top-header">
          <div className="admin-header-left">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar navigation"
              aria-expanded={sidebarOpen}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="admin-header-brand-mobile">
              <img
                src="/ergo-logo.jpg"
                alt="ERGO"
                className="admin-header-logo-mobile"
              />
            </div>
          </div>

          <div className="admin-header-right">
            <span className="ops-clock-chip" title="Asia/Kolkata">
              IST {clock.toLocaleTimeString('en-GB', { hour12: false })}
            </span>
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
              <span className="logout-btn-label">Log out</span>
            </button>
          </div>
        </header>

        {/* Routed Page Content */}
        <main className="admin-content-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

