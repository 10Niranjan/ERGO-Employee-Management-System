import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getTodayAttendance,
  markAttendance,
  getMonthlyAttendance,
  requestCorrection,
} from '../api/attendanceApi';
import {
  getLeaveBalances,
  applyLeave,
  getLeaveApplications,
} from '../api/leaveApi';
import {
  computeSalary,
  listPayslips,
  downloadPayslipPDF,
} from '../api/reportApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './EmployeeDashboardPage.css';

export default function EmployeeDashboardPage() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Active section tab: 'attendance' | 'leaves' | 'payslips'
  const [activeTab, setActiveTab] = useState('attendance');

  // Today attendance state
  const [todayData, setTodayData] = useState(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('present');
  const [submittingToday, setSubmittingToday] = useState(false);

  // Mandatory prompt modal
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Monthly calendar state
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [monthData, setMonthData] = useState(null);
  const [monthLoading, setMonthLoading] = useState(true);

  // Correction request modal
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionStatus, setCorrectionStatus] = useState('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Leave Management states
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveBalancesLoading, setLeaveBalancesLoading] = useState(true);
  const [myLeaves, setMyLeaves] = useState([]);
  const [myLeavesLoading, setMyLeavesLoading] = useState(true);

  // Apply Leave Modal
  const [isApplyLeaveModalOpen, setIsApplyLeaveModalOpen] = useState(false);
  const [applyFormData, setApplyFormData] = useState({
    leave_type_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // ─── Payslips & Download Centre states ────────────────────────────────────
  const [salaryMonth, setSalaryMonth] = useState(now.getMonth() + 1);
  const [salaryYear, setSalaryYear] = useState(now.getFullYear());
  const [mySalaryCalc, setMySalaryCalc] = useState(null);
  const [salaryCalcLoading, setSalaryCalcLoading] = useState(false);
  const [myPayslips, setMyPayslips] = useState([]);
  const [myPayslipsLoading, setMyPayslipsLoading] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  // Fetch today's status
  const fetchTodayStatus = useCallback(async () => {
    setTodayLoading(true);
    try {
      const data = await getTodayAttendance();
      setTodayData(data);
      if (data.should_prompt) {
        setShowPromptModal(true);
      }
    } catch (err) {
      console.error('Failed to fetch today attendance', err);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  // Fetch monthly calendar
  const fetchMonthly = useCallback(async (year, month) => {
    setMonthLoading(true);
    try {
      const data = await getMonthlyAttendance({ year, month });
      setMonthData(data);
    } catch (err) {
      console.error('Failed to fetch monthly attendance', err);
    } finally {
      setMonthLoading(false);
    }
  }, []);

  // Fetch leave balances
  const fetchBalances = useCallback(async () => {
    setLeaveBalancesLoading(true);
    try {
      const data = await getLeaveBalances({ year: now.getFullYear() });
      setLeaveBalances(data.balances || []);
      if (data.balances?.length > 0 && !applyFormData.leave_type_id) {
        setApplyFormData((prev) => ({ ...prev, leave_type_id: data.balances[0].leave_type_id }));
      }
    } catch (err) {
      console.error('Failed to fetch leave balances', err);
    } finally {
      setLeaveBalancesLoading(false);
    }
  }, [applyFormData.leave_type_id, now]);

  // Fetch my leave applications
  const fetchMyLeaves = useCallback(async () => {
    setMyLeavesLoading(true);
    try {
      const data = await getLeaveApplications();
      setMyLeaves(data.applications || []);
    } catch (err) {
      console.error('Failed to fetch my leave requests', err);
    } finally {
      setMyLeavesLoading(false);
    }
  }, []);

  // Fetch salary preview
  const fetchMySalary = useCallback(async () => {
    setSalaryCalcLoading(true);
    try {
      const data = await computeSalary({
        year: salaryYear,
        month: salaryMonth,
      });
      setMySalaryCalc(data);
    } catch (err) {
      console.error('Failed to compute salary', err);
    } finally {
      setSalaryCalcLoading(false);
    }
  }, [salaryYear, salaryMonth]);

  // Fetch saved payslips
  const fetchMyPayslips = useCallback(async () => {
    setMyPayslipsLoading(true);
    try {
      const data = await listPayslips();
      setMyPayslips(data.payslips || []);
    } catch (err) {
      console.error('Failed to load payslips', err);
    } finally {
      setMyPayslipsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayStatus();
    fetchBalances();
    fetchMyLeaves();
  }, [fetchTodayStatus, fetchBalances, fetchMyLeaves]);

  useEffect(() => {
    fetchMonthly(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth, fetchMonthly]);

  useEffect(() => {
    if (activeTab === 'payslips') {
      fetchMySalary();
      fetchMyPayslips();
    }
  }, [activeTab, fetchMySalary, fetchMyPayslips]);

  // Handle marking attendance
  async function handleMarkAttendance(statusToMark) {
    setSubmittingToday(true);
    try {
      await markAttendance({ status: statusToMark });
      showToast(`Attendance marked as '${statusToMark}' successfully!`, 'success');
      setShowPromptModal(false);
      fetchTodayStatus();
      fetchMonthly(selectedYear, selectedMonth);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to mark attendance', 'error');
    } finally {
      setSubmittingToday(false);
    }
  }

  // Open correction modal
  function handleOpenCorrection(dayItem) {
    setCorrectionTarget(dayItem.attendance);
    setCorrectionStatus(dayItem.attendance.status === 'half_day' ? 'present' : 'half_day');
    setCorrectionReason('');
    setIsCorrectionModalOpen(true);
  }

  // Submit correction request
  async function handleCorrectionSubmit(e) {
    e.preventDefault();
    if (!correctionReason.trim()) {
      showToast('Please provide a reason for the correction request', 'error');
      return;
    }
    setSubmittingCorrection(true);
    try {
      await requestCorrection(correctionTarget.id, {
        requested_status: correctionStatus,
        reason: correctionReason.trim(),
      });
      showToast('Correction request submitted for Admin review!', 'success');
      setIsCorrectionModalOpen(false);
      fetchMonthly(selectedYear, selectedMonth);
      fetchTodayStatus();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit correction request', 'error');
    } finally {
      setSubmittingCorrection(false);
    }
  }

  // Apply for leave submit
  async function handleApplyLeaveSubmit(e) {
    e.preventDefault();
    if (!applyFormData.reason.trim()) {
      showToast('Reason is required when applying for leave', 'error');
      return;
    }
    setSubmittingLeave(true);
    try {
      await applyLeave({
        leave_type_id: parseInt(applyFormData.leave_type_id, 10),
        start_date: applyFormData.start_date,
        end_date: applyFormData.end_date,
        reason: applyFormData.reason.trim(),
      });
      showToast('Leave request submitted successfully!', 'success');
      setIsApplyLeaveModalOpen(false);
      setApplyFormData({
        leave_type_id: leaveBalances[0]?.leave_type_id || '',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        reason: '',
      });
      fetchBalances();
      fetchMyLeaves();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit leave request', 'error');
    } finally {
      setSubmittingLeave(false);
    }
  }

  function handleMonthChange(delta) {
    let newM = selectedMonth + delta;
    let newY = selectedYear;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    } else if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setSelectedMonth(newM);
    setSelectedYear(newY);
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="employee-app-layout">
      {/* Top Header */}
      <header className="employee-top-header">
        <div className="employee-header-left">
          <div className="employee-brand-icon">E</div>
          <div className="employee-brand-text">
            <span className="brand-name">Ergo Management</span>
            <span className="brand-sub">Employee Self-Service</span>
          </div>
        </div>

        <div className="employee-header-right">
          <div className="user-profile-badge">
            <div className="user-avatar-circle">{user?.name?.charAt(0) || 'E'}</div>
            <div className="user-info-text">
              <span className="user-name">{user?.name}</span>
              <span className="user-meta">{user?.employee_id} • {user?.designation || 'Staff'}</span>
            </div>
          </div>
          <button
            type="button"
            id="employee-logout-btn"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Main Employee Content */}
      <main className="employee-main-content">
        <div className="page-wrapper">
          {/* Section Navigation Tabs */}
          <div className="employee-section-tabs">
            <button
              type="button"
              className={`emp-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              ⏱️ Attendance & Calendar
            </button>
            <button
              type="button"
              className={`emp-tab-btn ${activeTab === 'leaves' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaves')}
            >
              🏖️ Leave Balances & Requests
            </button>
            <button
              type="button"
              className={`emp-tab-btn ${activeTab === 'payslips' ? 'active' : ''}`}
              onClick={() => setActiveTab('payslips')}
            >
              💰 Payslips & Salary Statements
            </button>
          </div>

          {activeTab === 'attendance' ? (
            <>
              {/* Today Attendance Action Card */}
              <div className="today-attendance-hero card">
                <div className="today-hero-info">
                  <span className="today-date-badge">
                    📅 {todayData?.date ? new Date(todayData.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Today'}
                  </span>
                  <h1 className="today-title">
                    {todayData?.is_holiday ? (
                      <span>🏖️ Company Holiday: {todayData.holiday_name}</span>
                    ) : todayData?.is_weekend ? (
                      <span>🌴 Weekend (Non-Working Day)</span>
                    ) : todayData?.attendance ? (
                      <span>✓ Attendance Marked for Today</span>
                    ) : (
                      <span>Daily Attendance Pending</span>
                    )}
                  </h1>
                  <p className="text-muted text-sm">
                    Timezone: <strong>Asia/Kolkata (IST)</strong> • Cutoff: <strong>11:59 PM IST</strong>
                  </p>
                </div>

                <div className="today-action-box">
                  {todayLoading ? (
                    <span className="spinner" />
                  ) : todayData?.attendance ? (
                    <div className="today-marked-card">
                      <span className="text-muted text-xs">RECORDED STATUS</span>
                      <span className={`status-pill status-${todayData.attendance.status}`}>
                        {todayData.attendance.status.toUpperCase()}
                      </span>
                      <span className="text-muted text-xs">
                        Marked at: {new Date(todayData.attendance.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {todayData.attendance.is_admin_override && (
                        <span className="override-badge text-xs">⚡ Admin Override</span>
                      )}
                    </div>
                  ) : todayData?.is_weekend || todayData?.is_holiday ? (
                    <div className="non-working-notice">
                      <span>Non-working day — attendance not required.</span>
                    </div>
                  ) : (
                    <div className="mark-quick-options">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={submittingToday}
                        onClick={() => handleMarkAttendance('present')}
                      >
                        🏢 Mark Present
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={submittingToday}
                        onClick={() => handleMarkAttendance('half_day')}
                      >
                        🌗 Half-Day
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={submittingToday}
                        onClick={() => handleMarkAttendance('travel')}
                      >
                        ✈️ On Travel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Attendance Calendar */}
              <div className="calendar-section">
                <div className="calendar-header-row">
                  <div>
                    <h2 className="section-title">My Attendance Calendar</h2>
                    <p className="text-muted text-sm">
                      Review your daily attendance history, non-working days, and submit correction requests if needed.
                    </p>
                  </div>

                  {/* Month Selector */}
                  <div className="month-selector-group">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleMonthChange(-1)}
                    >
                      ← Prev
                    </button>
                    <span className="current-month-badge">
                      {monthNames[selectedMonth - 1]} {selectedYear}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleMonthChange(1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>

                {/* Monthly Summary Badges */}
                {monthData?.summary && (
                  <div className="attendance-kpi-grid">
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Working Days</span>
                      <div className="kpi-value">{monthData.summary.total_working_days}</div>
                      <span className="kpi-sub text-muted text-xs">In this month</span>
                    </div>
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Present Days</span>
                      <div className="kpi-value text-success">{monthData.summary.present_days}</div>
                      <span className="kpi-sub text-muted text-xs">Full day rate</span>
                    </div>
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Half Days</span>
                      <div className="kpi-value text-warning">{monthData.summary.half_days}</div>
                      <span className="kpi-sub text-muted text-xs">50% day rate</span>
                    </div>
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Travel / On Duty</span>
                      <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{monthData.summary.travel_days}</div>
                      <span className="kpi-sub text-muted text-xs">Full day rate</span>
                    </div>
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Absent / Unmarked</span>
                      <div className="kpi-value text-danger">{monthData.summary.absent_days + monthData.summary.not_marked_days}</div>
                      <span className="kpi-sub text-muted text-xs">Past working days</span>
                    </div>
                    <div className="kpi-card card">
                      <span className="kpi-title text-muted text-xs">Holidays & Weekends</span>
                      <div className="kpi-value">{monthData.summary.holiday_days + monthData.summary.weekend_days}</div>
                      <span className="kpi-sub text-muted text-xs">Paid non-working</span>
                    </div>
                  </div>
                )}

                {/* Calendar Days Table / Grid */}
                <div className="table-card card" style={{ marginTop: 'var(--space-4)' }}>
                  {monthLoading ? (
                    <div className="state-container">
                      <span className="spinner" />
                      <p className="text-muted">Loading attendance calendar...</p>
                    </div>
                  ) : !monthData?.days?.length ? (
                    <div className="state-container">
                      <p className="text-muted">No records available for this month.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Day</th>
                            <th>Attendance Status</th>
                            <th>Marked Time</th>
                            <th>Remarks / Correction</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthData.days.map((dayItem) => {
                            const isPast = dayItem.date < (todayData?.date || '');
                            const hasAttendance = Boolean(dayItem.attendance);
                            const isPendingCorrection = dayItem.attendance?.correction_status === 'pending';

                            return (
                              <tr
                                key={dayItem.date}
                                className={
                                  dayItem.is_weekend
                                    ? 'row-weekend'
                                    : dayItem.is_holiday
                                    ? 'row-holiday'
                                    : ''
                                }
                              >
                                <td>
                                  <strong className="calendar-date-cell">
                                    {new Date(dayItem.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                  </strong>
                                </td>
                                <td>
                                  <span className="text-muted text-sm">{dayItem.day_of_week}</span>
                                </td>
                                <td>
                                  {dayItem.is_holiday ? (
                                    <span className="status-pill status-holiday">🏖️ {dayItem.holiday_name || 'Holiday'}</span>
                                  ) : dayItem.is_weekend ? (
                                    <span className="status-pill status-weekend">🌴 Weekend</span>
                                  ) : hasAttendance ? (
                                    <span className={`status-pill status-${dayItem.attendance.status}`}>
                                      {dayItem.attendance.status.toUpperCase()}
                                    </span>
                                  ) : isPast ? (
                                    <span className="status-pill status-absent">Not Marked / Absent</span>
                                  ) : dayItem.date === todayData?.date ? (
                                    <span className="status-pill status-unmarked">Pending Today</span>
                                  ) : (
                                    <span className="text-muted text-xs">Upcoming</span>
                                  )}
                                </td>
                                <td>
                                  <span className="text-sm">
                                    {dayItem.attendance?.marked_at
                                      ? new Date(dayItem.attendance.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                                      : '—'}
                                  </span>
                                </td>
                                <td>
                                  <div className="remarks-cell">
                                    {dayItem.attendance?.is_admin_override && (
                                      <span className="override-badge text-xs">⚡ Admin Override</span>
                                    )}
                                    {isPendingCorrection && (
                                      <span className="status-pill status-unpaid text-xs">
                                        ⏳ Correction Pending ({dayItem.attendance.correction_requested_status})
                                      </span>
                                    )}
                                    {dayItem.attendance?.correction_status === 'declined' && (
                                      <span className="status-pill status-danger text-xs" title={dayItem.attendance.correction_declined_reason}>
                                        ✕ Correction Declined
                                      </span>
                                    )}
                                    {!dayItem.attendance?.is_admin_override && !dayItem.attendance?.correction_status && '—'}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {hasAttendance && !isPendingCorrection && (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => handleOpenCorrection(dayItem)}
                                    >
                                      ✏️ Request Correction
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : activeTab === 'leaves' ? (
            /* ─── Leaves & Balances Section ──────────────────────────────── */
            <div className="leaves-section">
              <div className="page-header-row" style={{ marginBottom: 'var(--space-2)' }}>
                <div>
                  <h2 className="section-title">Leave Balances ({now.getFullYear()})</h2>
                  <p className="text-muted text-sm">
                    Unused balances reset annually. Paid leaves are compensated at 100% per-day rate.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsApplyLeaveModalOpen(true)}
                >
                  <span>+</span> Apply for Leave
                </button>
              </div>

              {/* Leave Balances KPI Cards */}
              <div className="dashboard-kpi-grid">
                {leaveBalancesLoading ? (
                  <div className="state-container">
                    <span className="spinner" />
                    <p className="text-muted">Loading leave balances...</p>
                  </div>
                ) : (
                  leaveBalances.map((b) => (
                    <div key={b.id} className="kpi-card card">
                      <div className="kpi-header">
                        <span className="kpi-title text-muted text-xs">{b.name.toUpperCase()}</span>
                        <span className="kpi-icon">{b.is_paid ? '🏖️' : '⏱️'}</span>
                      </div>
                      <div className="kpi-value" style={{ color: b.is_paid ? 'var(--color-primary)' : 'inherit' }}>
                        {b.is_paid ? b.remaining : b.used}
                        <span className="text-muted text-xs font-normal">
                          {b.is_paid ? ` / ${b.allotted} days left` : ' days taken'}
                        </span>
                      </div>
                      <span className="kpi-sub text-muted text-xs">
                        {b.is_paid ? `${b.used} days used this year` : 'Unpaid (Salary deducted)'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* My Leave Requests History */}
              <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
                <div className="card-header-bar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                  <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)' }}>My Leave Requests</h3>
                </div>

                {myLeavesLoading ? (
                  <div className="state-container">
                    <span className="spinner" />
                    <p className="text-muted">Loading leave history...</p>
                  </div>
                ) : myLeaves.length === 0 ? (
                  <div className="state-container">
                    <span className="state-icon">🏖️</span>
                    <h3>No leave requests found</h3>
                    <p className="text-muted text-sm">
                      Click "+ Apply for Leave" above to submit a new request.
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Leave Type</th>
                          <th>Date Range</th>
                          <th>Working Days</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th>Submitted On</th>
                          <th>Reviewer Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myLeaves.map((leave) => (
                          <tr key={leave.id}>
                            <td>
                              <strong className="emp-fullname">{leave.leave_type_name}</strong>
                              <span className="text-muted text-xs block">
                                {leave.is_paid ? 'Paid' : 'Unpaid'}
                              </span>
                            </td>
                            <td>
                              <strong className="calendar-date-cell">
                                {new Date(leave.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                {' → '}
                                {new Date(leave.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </strong>
                            </td>
                            <td>
                              <strong>{leave.working_days_count} day(s)</strong>
                            </td>
                            <td>
                              <span className="text-sm">{leave.reason}</span>
                            </td>
                            <td>
                              <span
                                className={`status-pill ${
                                  leave.status === 'approved'
                                    ? 'status-active'
                                    : leave.status === 'declined'
                                    ? 'status-inactive'
                                    : 'status-unpaid'
                                }`}
                              >
                                {leave.status.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <span className="text-muted text-xs">
                                {new Date(leave.created_at).toLocaleDateString('en-IN')}
                              </span>
                            </td>
                            <td>
                              <span className="text-sm text-muted">
                                {leave.decline_reason
                                  ? `Decline reason: ${leave.decline_reason}`
                                  : leave.admin_notes
                                  ? leave.admin_notes
                                  : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ─── Payslips & Download Centre Section ─────────────────────── */
            <div className="employee-payslips-section">
              <div className="page-header-row" style={{ marginBottom: 'var(--space-2)' }}>
                <div>
                  <h2 className="section-title">Salary Statements & Payslip Downloads</h2>
                  <p className="text-muted text-sm">
                    Review your transparent day-by-day salary calculations and download official PDF payslips.
                  </p>
                </div>
              </div>

              {/* Month Selector Controls */}
              <div className="page-controls card">
                <div className="filter-group">
                  <label className="filter-label" htmlFor="emp-salary-month">
                    Select Month:
                  </label>
                  <select
                    id="emp-salary-month"
                    className="filter-select"
                    value={salaryMonth}
                    onChange={(e) => setSalaryMonth(parseInt(e.target.value, 10))}
                  >
                    {monthNames.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label className="filter-label" htmlFor="emp-salary-year">
                    Year:
                  </label>
                  <input
                    id="emp-salary-year"
                    type="number"
                    min="2020"
                    max="2030"
                    style={{ width: '90px' }}
                    value={salaryYear}
                    onChange={(e) => setSalaryYear(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              {/* Live Salary KPI Summary */}
              {salaryCalcLoading ? (
                <div className="state-container">
                  <span className="spinner" />
                  <p className="text-muted">Computing salary statement...</p>
                </div>
              ) : mySalaryCalc?.summary && (
                <div className="attendance-kpi-grid" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Working Days</span>
                    <div className="kpi-value">{mySalaryCalc.summary.working_days}</div>
                    <span className="kpi-sub text-muted text-xs">In {monthNames[salaryMonth - 1]}</span>
                  </div>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Present Days</span>
                    <div className="kpi-value text-success">{mySalaryCalc.summary.present_days}</div>
                    <span className="kpi-sub text-muted text-xs">100% Rate</span>
                  </div>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Half-Days</span>
                    <div className="kpi-value text-warning">{mySalaryCalc.summary.half_days}</div>
                    <span className="kpi-sub text-muted text-xs">50% Rate</span>
                  </div>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Travel / On Duty</span>
                    <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{mySalaryCalc.summary.travel_days}</div>
                    <span className="kpi-sub text-muted text-xs">100% Rate</span>
                  </div>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Paid Leaves</span>
                    <div className="kpi-value text-success">{mySalaryCalc.summary.paid_leave_days}</div>
                    <span className="kpi-sub text-muted text-xs">100% Rate</span>
                  </div>
                  <div className="kpi-card card">
                    <span className="kpi-title text-muted text-xs">Absent / Unpaid</span>
                    <div className="kpi-value text-danger">
                      {mySalaryCalc.summary.absent_days + mySalaryCalc.summary.unpaid_leave_days}
                    </div>
                    <span className="kpi-sub text-muted text-xs">0% Rate</span>
                  </div>
                  <div className="kpi-card card" style={{ gridColumn: 'span 2', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-focus)' }}>
                    <span className="kpi-title text-muted text-xs">NET PAYABLE COMPENSATION</span>
                    <div className="kpi-value text-success" style={{ fontSize: 'var(--font-size-2xl)' }}>
                      ₹{parseFloat(mySalaryCalc.summary.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="kpi-sub text-muted text-xs">
                      Base Rate: ₹{parseFloat(mySalaryCalc.summary.per_day_salary).toFixed(2)}/day
                    </span>
                  </div>
                </div>
              )}

              {/* Day-by-Day Statement Table */}
              {mySalaryCalc?.days && (
                <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
                  <div className="card-header-bar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)' }}>
                      Itemized Daily Calculation Breakdown ({monthNames[salaryMonth - 1]} {salaryYear})
                    </h3>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Day Rate (₹)</th>
                          <th>Payable Factor</th>
                          <th>Earned Amount (₹)</th>
                          <th>Calculation Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mySalaryCalc.days.map((d) => (
                          <tr key={d.date} className={d.status === 'weekend' ? 'row-weekend' : d.status === 'holiday' ? 'row-holiday' : ''}>
                            <td>
                              <strong className="calendar-date-cell">
                                {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                              </strong>
                            </td>
                            <td>
                              <span className={`status-pill status-${d.status}`}>
                                {d.status.toUpperCase()}
                              </span>
                            </td>
                            <td>₹{parseFloat(d.rate).toFixed(2)}</td>
                            <td>{d.payable_factor * 100}%</td>
                            <td>
                              <strong className="salary-rate-text">
                                ₹{parseFloat(d.daily_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </strong>
                            </td>
                            <td>
                              <span className="text-muted text-sm">{d.note}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Official Available Payslips */}
              <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
                <div className="card-header-bar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                  <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)' }}>
                    Official PDF Payslips Archive
                  </h3>
                </div>

                {myPayslipsLoading ? (
                  <div className="state-container">
                    <span className="spinner" />
                    <p className="text-muted">Loading payslips archive...</p>
                  </div>
                ) : myPayslips.length === 0 ? (
                  <div className="state-container">
                    <span className="state-icon">📄</span>
                    <h3>No archived payslips available yet</h3>
                    <p className="text-muted text-sm">
                      Official payslips generated by Admin will appear here for download.
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Working Days</th>
                          <th>Present / Travel</th>
                          <th>Paid Leaves</th>
                          <th>Net Salary</th>
                          <th>Generated On</th>
                          <th style={{ textAlign: 'right' }}>Download</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myPayslips.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong className="emp-fullname">
                                {monthNames[p.month - 1]} {p.year}
                              </strong>
                            </td>
                            <td>{p.working_days} days</td>
                            <td>{p.present_days + p.travel_days} days</td>
                            <td>{p.paid_leave_days} days</td>
                            <td>
                              <strong className="salary-rate-highlight">
                                ₹{parseFloat(p.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </strong>
                            </td>
                            <td>
                              <span className="text-muted text-xs">
                                {new Date(p.generated_at).toLocaleDateString('en-IN')}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  downloadPayslipPDF(
                                    p.id,
                                    `Payslip_${user?.employee_id || 'employee'}_${monthNames[p.month - 1]}_${p.year}.pdf`
                                  )
                                }
                              >
                                ⬇️ Download PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── Mandatory Daily Attendance Modal ────────────────────────────── */}
      <Modal
        isOpen={showPromptModal}
        onClose={() => {}}
        title="☀️ Mark Today's Attendance"
        maxWidth="460px"
      >
        <div className="prompt-modal-body">
          <p className="text-muted text-sm">
            Good day, <strong>{user?.name}</strong>! Please mark your daily presence before accessing the workspace.
          </p>

          <div className="prompt-options-list">
            <label className={`prompt-option-card ${selectedStatus === 'present' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="promptStatus"
                value="present"
                checked={selectedStatus === 'present'}
                onChange={() => setSelectedStatus('present')}
              />
              <div className="option-text">
                <strong>🏢 Present (Full Day)</strong>
                <span className="text-muted text-xs">Working standard hours (100% day compensation)</span>
              </div>
            </label>

            <label className={`prompt-option-card ${selectedStatus === 'half_day' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="promptStatus"
                value="half_day"
                checked={selectedStatus === 'half_day'}
                onChange={() => setSelectedStatus('half_day')}
              />
              <div className="option-text">
                <strong>🌗 Half-Day</strong>
                <span className="text-muted text-xs">Working half shift (50% day compensation)</span>
              </div>
            </label>

            <label className={`prompt-option-card ${selectedStatus === 'travel' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="promptStatus"
                value="travel"
                checked={selectedStatus === 'travel'}
                onChange={() => setSelectedStatus('travel')}
              />
              <div className="option-text">
                <strong>✈️ On Duty / Travel</strong>
                <span className="text-muted text-xs">Outstation or official company business travel</span>
              </div>
            </label>
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={submittingToday}
              onClick={() => handleMarkAttendance(selectedStatus)}
            >
              {submittingToday ? <span className="spinner" /> : null}
              {submittingToday ? 'Recording Attendance...' : 'Confirm & Enter Dashboard'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Attendance Correction Modal ─────────────────────────────────── */}
      <Modal
        isOpen={isCorrectionModalOpen}
        onClose={() => !submittingCorrection && setIsCorrectionModalOpen(false)}
        title="Request Attendance Correction"
        maxWidth="500px"
      >
        <form onSubmit={handleCorrectionSubmit} className="modal-form">
          <div className="alert alert-info">
            Correction requests are submitted directly to your Admin for verification and manual override.
          </div>

          <div className="form-group">
            <label className="form-label">Record Date</label>
            <input
              type="text"
              disabled
              value={correctionTarget ? new Date(correctionTarget.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Current Marked Status</label>
            <input
              type="text"
              disabled
              value={correctionTarget ? correctionTarget.status.toUpperCase() : ''}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="requested-status-select">
              Correct / Desired Status *
            </label>
            <select
              id="requested-status-select"
              value={correctionStatus}
              onChange={(e) => setCorrectionStatus(e.target.value)}
              disabled={submittingCorrection}
            >
              <option value="present">Present (Full Day)</option>
              <option value="half_day">Half-Day (50%)</option>
              <option value="travel">On Duty / Travel</option>
              <option value="absent">Absent</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="correction-reason-input">
              Reason / Justification *
            </label>
            <textarea
              id="correction-reason-input"
              rows="3"
              required
              placeholder="e.g. Forgot to mark on time due to early morning client travel..."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              disabled={submittingCorrection}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsCorrectionModalOpen(false)}
              disabled={submittingCorrection}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submittingCorrection}
            >
              {submittingCorrection ? <span className="spinner" /> : null}
              {submittingCorrection ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Apply For Leave Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={isApplyLeaveModalOpen}
        onClose={() => !submittingLeave && setIsApplyLeaveModalOpen(false)}
        title="Apply for Leave"
        maxWidth="520px"
      >
        <form onSubmit={handleApplyLeaveSubmit} className="modal-form">
          <div className="alert alert-info">
            <strong>Cutoff Policy:</strong> Same-day leave must be submitted before <strong>9:00 AM IST</strong>. Weekends and public holidays are automatically excluded from balance consumption.
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="leave-type-select">
              Leave Category *
            </label>
            <select
              id="leave-type-select"
              required
              value={applyFormData.leave_type_id}
              onChange={(e) => setApplyFormData({ ...applyFormData, leave_type_id: e.target.value })}
              disabled={submittingLeave}
            >
              {leaveBalances.map((b) => (
                <option key={b.id} value={b.leave_type_id}>
                  {b.name} ({b.is_paid ? `${b.remaining} days available` : 'Unpaid'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="leave-start-date">
                Start Date *
              </label>
              <input
                id="leave-start-date"
                type="date"
                required
                value={applyFormData.start_date}
                onChange={(e) => setApplyFormData({ ...applyFormData, start_date: e.target.value })}
                disabled={submittingLeave}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="leave-end-date">
                End Date *
              </label>
              <input
                id="leave-end-date"
                type="date"
                required
                value={applyFormData.end_date}
                onChange={(e) => setApplyFormData({ ...applyFormData, end_date: e.target.value })}
                disabled={submittingLeave}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="leave-reason-textarea">
              Reason for Leave *
            </label>
            <textarea
              id="leave-reason-textarea"
              rows="3"
              required
              placeholder="e.g. Attending sibling wedding out of town..."
              value={applyFormData.reason}
              onChange={(e) => setApplyFormData({ ...applyFormData, reason: e.target.value })}
              disabled={submittingLeave}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsApplyLeaveModalOpen(false)}
              disabled={submittingLeave}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingLeave}>
              {submittingLeave ? <span className="spinner" /> : null}
              {submittingLeave ? 'Submitting Application...' : 'Submit Leave Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
