import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock4,
  Plane,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getTodayAttendance } from '../api/attendanceApi';
import { getLeaveTypes } from '../api/leaveTypeApi';
import { getHolidays } from '../api/holidayApi';
import { getLeaveApplications } from '../api/leaveApi';
import './AdminDashboardPage.css';

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [todayData, setTodayData] = useState(null);
  const [stats, setStats] = useState({
    leaveTypesCount: 0,
    holidaysCount: 0,
    pendingLeavesCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOverview() {
      try {
        const [todayAtt, ltData, holData, leavesData] = await Promise.all([
          getTodayAttendance(),
          getLeaveTypes({ include_inactive: true }),
          getHolidays({ year: new Date().getFullYear() }),
          getLeaveApplications({ status: 'pending' }),
        ]);

        setTodayData(todayAtt);
        setStats({
          leaveTypesCount: ltData.leave_types?.length || 0,
          holidaysCount: holData.holidays?.length || 0,
          pendingLeavesCount: leavesData.applications?.length || 0,
        });
      } catch (err) {
        console.error('Failed to load dashboard overview stats', err);
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  const todayStats = todayData?.stats || {
    total_active_employees: 0,
    present: 0,
    half_day: 0,
    travel: 0,
    absent: 0,
    not_marked: 0,
    pending_corrections: 0,
  };

  return (
    <div className="page-wrapper">
      {/* Welcome Hero */}
      <div className="admin-welcome-hero card">
        <div className="hero-content">
          <span className="hero-greeting">Welcome back, {user?.name} 👋</span>
          <h1 className="hero-title">Workforce & HR Operations Control</h1>
          <p className="hero-subtitle text-muted">
            Today is{' '}
            <strong>
              {todayData?.date
                ? new Date(todayData.date).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Today'}
            </strong>{' '}
            • Real-time attendance monitoring, leave approvals, and workforce administration.
          </p>
        </div>
      </div>

      {/* Today's Live Attendance KPI Cards */}
      <div>
        <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h2 className="section-title">Today's Presence & Actions</h2>
          <Link to="/admin/attendance" className="btn btn-ghost btn-sm">
            Open Attendance Manager →
          </Link>
        </div>

        <div className="dashboard-kpi-grid">
          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">Total Staff</span>
              <span className="icon-chip icon-chip-sm icon-chip-primary">
                <Users size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value">
              {loading ? <span className="spinner" /> : todayStats.total_active_employees}
            </div>
            <span className="kpi-sub text-muted text-xs">Active accounts</span>
          </div>

          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">Present</span>
              <span className="icon-chip icon-chip-sm icon-chip-success">
                <CheckCircle2 size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value text-success">
              {loading ? <span className="spinner" /> : todayStats.present}
            </div>
            <span className="kpi-sub text-muted text-xs">Full day marked</span>
          </div>

          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">Half-Day</span>
              <span className="icon-chip icon-chip-sm icon-chip-warning">
                <Clock4 size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value text-warning">
              {loading ? <span className="spinner" /> : todayStats.half_day}
            </div>
            <span className="kpi-sub text-muted text-xs">50% day shift</span>
          </div>

          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">On Travel</span>
              <span className="icon-chip icon-chip-sm icon-chip-primary">
                <Plane size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>
              {loading ? <span className="spinner" /> : todayStats.travel}
            </div>
            <span className="kpi-sub text-muted text-xs">Client duty</span>
          </div>

          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">Not Marked</span>
              <span className="icon-chip icon-chip-sm icon-chip-danger">
                <AlertTriangle size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value text-danger">
              {loading ? <span className="spinner" /> : todayStats.not_marked + todayStats.absent}
            </div>
            <span className="kpi-sub text-muted text-xs">Pending cutoff</span>
          </div>

          <div className="kpi-card card">
            <div className="kpi-header">
              <span className="kpi-title text-muted text-xs">Pending Leaves</span>
              <span className="icon-chip icon-chip-sm icon-chip-warning">
                <ClipboardList size={15} aria-hidden="true" />
              </span>
            </div>
            <div className="kpi-value" style={{ color: stats.pendingLeavesCount > 0 ? 'var(--color-warning)' : 'inherit' }}>
              {loading ? <span className="spinner" /> : stats.pendingLeavesCount}
            </div>
            <span className="kpi-sub text-muted text-xs">
              {stats.pendingLeavesCount > 0 ? (
                <Link to="/admin/leaves" className="kpi-inline-link">
                  Review Leaves <ArrowRight size={12} aria-hidden="true" />
                </Link>
              ) : (
                'All reviewed'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Core Management Modules Grid */}
      <div>
        <h2 className="section-title" style={{ marginBottom: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
          Operations & Management
        </h2>
        <div className="dashboard-modules-grid">
          <Link to="/admin/leaves" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <ClipboardCheck size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Leave Applications</h3>
              <p className="text-muted text-sm">
                Review staff leave requests, approve with balance deduction, or decline with mandatory reason.
              </p>
              <span className="module-link-arrow">
                Manage Leave Requests <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link to="/admin/attendance" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <Clock4 size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Daily Attendance</h3>
              <p className="text-muted text-sm">
                View team presence, perform manual overrides with audit logs, and review correction requests.
              </p>
              <span className="module-link-arrow">
                Open Attendance Manager <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link to="/admin/employees" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <Users size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Employee Directory</h3>
              <p className="text-muted text-sm">
                Onboard new employees, view staff records, edit profiles, and deactivate accounts.
              </p>
              <span className="module-link-arrow">
                Open Directory <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link to="/admin/leave-types" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <Tags size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Leave Configuration</h3>
              <p className="text-muted text-sm">
                Manage leave types (Casual, Sick, Paid, Unpaid) and configure annual quotas.
              </p>
              <span className="module-link-arrow">
                Configure Leaves <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link to="/admin/holidays" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <CalendarDays size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Holiday Calendar</h3>
              <p className="text-muted text-sm">
                Maintain national and company holidays ({stats.holidaysCount} configured for {new Date().getFullYear()}).
              </p>
              <span className="module-link-arrow">
                Manage Holidays <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link to="/admin/salaries" className="module-card card">
            <div className="icon-chip icon-chip-lg icon-chip-primary">
              <Wallet size={22} aria-hidden="true" />
            </div>
            <div className="module-details">
              <h3>Salary Rate Management</h3>
              <p className="text-muted text-sm">
                Set and update employee per-day base salary rates with complete audit logging.
              </p>
              <span className="module-link-arrow">
                Manage Salaries <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
