import { useState, useEffect, useRef, useCallback } from 'react';
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
import { getTodayAttendance, getCorrections } from '../api/attendanceApi';
import { getLeaveTypes } from '../api/leaveTypeApi';
import { getHolidays } from '../api/holidayApi';
import { getLeaveApplications } from '../api/leaveApi';
import { getSalaryHistory } from '../api/salaryApi';
import { getUsers } from '../api/userApi';
import './AdminDashboardPage.css';

const LOG_POLL_MS = 20000;
const LOG_MAX_LINES = 30;
const LOG_SEED_LINES = 10;

/**
 * Turns a snapshot from every admin-facing endpoint into one flat, sorted
 * event list. Each source contributes events with a *real* timestamp already
 * on the record (marked_at / created_at / changed_at / correction_requested_at)
 * — nothing here is synthesized.
 */
function buildEvents(todayAtt, leavesAll, salaryHistory, corrections) {
  const events = [];

  (todayAtt?.employees || []).forEach((emp) => {
    if (!emp.attendance?.marked_at) return;
    const status = emp.current_status;
    events.push({
      id: `att-${emp.attendance.attendance_id}`,
      time: emp.attendance.marked_at,
      tag: status === 'absent' ? 'ABSENT' : 'ATTEND',
      tone: status === 'absent' ? 'bad' : 'ok',
      msg: `${emp.name} marked ${status.replace('_', ' ')}${emp.attendance.is_admin_override ? ' (admin override)' : ''}`,
    });
  });

  (leavesAll?.applications || []).forEach((app) => {
    if (app.status === 'pending') {
      events.push({
        id: `leave-${app.id}`,
        time: app.created_at,
        tag: 'LEAVE',
        tone: '',
        msg: `${app.employee_name} filed ${app.leave_type_name} (${app.working_days_count}d) — pending review`,
      });
    } else if (app.status === 'approved' || app.status === 'declined') {
      events.push({
        id: `leave-review-${app.id}`,
        time: app.reviewed_at || app.created_at,
        tag: 'LEAVE',
        tone: app.status === 'approved' ? 'ok' : 'bad',
        msg: `${app.employee_name}'s ${app.leave_type_name} ${app.status}${app.reviewer_name ? ` by ${app.reviewer_name}` : ''}${app.status === 'declined' && app.decline_reason ? `: ${app.decline_reason}` : ''}`,
      });
    }
  });

  (salaryHistory?.history || []).forEach((rec) => {
    events.push({
      id: `salary-${rec.id}`,
      time: rec.changed_at,
      tag: 'SALARY',
      tone: '',
      msg: `${rec.employee_name}'s salary ₹${rec.old_monthly_salary} → ₹${rec.new_monthly_salary}/mo${rec.changed_by_name ? ` by ${rec.changed_by_name}` : ''}`,
    });
  });

  (corrections?.corrections || []).forEach((c) => {
    events.push({
      id: `corr-${c.id}`,
      time: c.correction_requested_at,
      tag: 'CORRECT',
      tone: '',
      msg: `${c.employee_name} requested correction to ${c.correction_requested_status?.replace('_', ' ')} for ${c.date}`,
    });
  });

  return events.sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** Pure — real created_at, safe to seed on initial load like every other source. */
function seedUserEvents(users) {
  return users.map((u) => ({
    id: `user-new-${u.id}`,
    time: u.created_at,
    tag: 'STAFF',
    tone: 'ok',
    msg: `${u.name} onboarded${u.designation ? ` as ${u.designation}` : ''}`,
  }));
}

/** Diffs the current roster against the last-*polled* snapshot to catch new
 * hires and activation/deactivation live. Status changes have no historical
 * audit trail — only current status is stored — so they can only be
 * detected while the dashboard is open through the transition. Mutates
 * prevStatusMap; only call this from the polling loop. The baseline is
 * established separately by the initial load (seedUserEvents + a plain
 * assignment) so this never re-fires "onboarded" for people who already
 * existed when the page opened — including under React StrictMode's
 * double-invoked effects in dev. */
function diffUserEvents(users, prevStatusMap) {
  const events = [];
  users.forEach((u) => {
    const prevStatus = prevStatusMap.get(u.id);
    if (prevStatus === undefined) {
      events.push({
        id: `user-new-${u.id}`,
        time: u.created_at,
        tag: 'STAFF',
        tone: 'ok',
        msg: `${u.name} onboarded${u.designation ? ` as ${u.designation}` : ''}`,
      });
    } else if (prevStatus !== u.status) {
      events.push({
        id: `user-status-${u.id}-${u.status}-${u.updated_at}`,
        time: u.updated_at,
        tag: 'STAFF',
        tone: u.status === 'active' ? 'ok' : 'bad',
        msg: `${u.name} ${u.status === 'active' ? 'reactivated' : 'deactivated'}`,
      });
    }
    prevStatusMap.set(u.id, u.status);
  });
  return events;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [todayData, setTodayData] = useState(null);
  const [stats, setStats] = useState({
    leaveTypesCount: 0,
    holidaysCount: 0,
    pendingLeavesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [logEntries, setLogEntries] = useState([]);
  const seenIds = useRef(new Set());
  const prevUserStatus = useRef(new Map());

  // Fetches every admin-facing source used by both the initial load and
  // each poll — real records only, nothing fabricated.
  const fetchSources = useCallback(async () => {
    const [todayAtt, leavesAll, salaryHistory, corrections, usersData] = await Promise.all([
      getTodayAttendance(),
      getLeaveApplications({}),
      getSalaryHistory({}),
      getCorrections({ status: 'all' }),
      getUsers({ limit: 100 }),
    ]);
    const pendingLeavesCount = (leavesAll.applications || []).filter((a) => a.status === 'pending').length;
    const events = buildEvents(todayAtt, leavesAll, salaryHistory, corrections);
    return { todayAtt, pendingLeavesCount, events, users: usersData.users || [] };
  }, []);

  const pollLog = useCallback(async () => {
    try {
      const { todayAtt, pendingLeavesCount, events, users } = await fetchSources();
      setTodayData(todayAtt);
      setStats((s) => ({ ...s, pendingLeavesCount }));

      // Only the polling loop mutates prevUserStatus — see diffUserEvents.
      const userEvents = diffUserEvents(users, prevUserStatus.current);
      const merged = [...events, ...userEvents].sort((a, b) => new Date(b.time) - new Date(a.time));

      const fresh = merged.filter((e) => !seenIds.current.has(e.id));
      if (fresh.length === 0) return;
      fresh.forEach((e) => seenIds.current.add(e.id));
      setLogEntries((prev) => [...fresh, ...prev].slice(0, LOG_MAX_LINES));
    } catch {
      // Silent — this is a background refresh, the page already has data on screen.
    }
  }, [fetchSources]);

  useEffect(() => {
    async function loadOverview() {
      try {
        const [{ todayAtt, pendingLeavesCount, events, users }, ltData, holData] = await Promise.all([
          fetchSources(),
          getLeaveTypes({ include_inactive: true }),
          getHolidays({ year: new Date().getFullYear() }),
        ]);

        setTodayData(todayAtt);
        setStats({
          leaveTypesCount: ltData.leave_types?.length || 0,
          holidaysCount: holData.holidays?.length || 0,
          pendingLeavesCount,
        });

        // Idempotent: establishes the baseline for live status-change
        // detection and seeds onboarding events from real created_at.
        // Safe to run twice (React StrictMode) — same input, same output.
        prevUserStatus.current = new Map(users.map((u) => [u.id, u.status]));
        const merged = [...events, ...seedUserEvents(users)].sort((a, b) => new Date(b.time) - new Date(a.time));
        const seed = merged.slice(0, LOG_SEED_LINES);
        seenIds.current = new Set(seed.map((e) => e.id));
        setLogEntries(seed);
      } catch (err) {
        console.error('Failed to load dashboard overview stats', err);
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
    const interval = setInterval(pollLog, LOG_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchSources, pollLog]);

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
          <span className="hero-greeting">Welcome back, {user?.name}</span>
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

          <div className="kpi-card card ok">
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

          <div className="kpi-card card warn">
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

          <div className="kpi-card card bad">
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

      {/* Live Activity Feed — polls attendance & leave data every 20s */}
      <div className="ops-log-panel">
        <div className="ops-log-head">
          <span className="ops-log-live-dot" aria-hidden="true" />
          <h3>Live Feed</h3>
        </div>
        <div className="ops-log-body">
          {logEntries.length === 0 ? (
            <p className="ops-log-empty">
              {loading ? 'Connecting…' : 'No attendance or leave activity yet today.'}
            </p>
          ) : (
            logEntries.map((e) => (
              <div className="ops-log-line" key={e.id}>
                <span className="ops-log-time">
                  {new Date(e.time).toLocaleTimeString('en-GB', { hour12: false })}
                </span>
                <span className={`ops-log-tag ${e.tone}`}>{e.tag}</span>
                <span className="ops-log-msg">{e.msg}</span>
              </div>
            ))
          )}
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
