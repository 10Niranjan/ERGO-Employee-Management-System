import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminLayout.css';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const navItems = [
    { to: '/admin/dashboard', label: 'Overview', icon: '📊' },
    { to: '/admin/reports', label: 'Reports & Payroll', icon: '📈' },
    { to: '/admin/leaves', label: 'Leave Requests', icon: '📝' },
    { to: '/admin/attendance', label: 'Attendance', icon: '⏱️' },
    { to: '/admin/employees', label: 'Employees', icon: '👥' },
    { to: '/admin/leave-types', label: 'Leave Types', icon: '🏖️' },
    { to: '/admin/holidays', label: 'Holidays', icon: '📅' },
    { to: '/admin/salaries', label: 'Salary Rates', icon: '💰' },
    { to: '/admin/salary-history', label: 'Salary History', icon: '📜' },
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
              <span className="nav-tab-icon">{item.icon}</span>
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
