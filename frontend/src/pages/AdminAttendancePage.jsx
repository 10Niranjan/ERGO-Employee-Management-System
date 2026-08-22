import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  Check,
  Hourglass,
  Info,
  Palmtree,
  Search,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  getTeamAttendance,
  getCorrections,
  reviewCorrection,
  overrideAttendance,
  getMonthlyAttendance,
} from '../api/attendanceApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './AdminAttendancePage.css';

export default function AdminAttendancePage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'corrections'

  // Team Attendance state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamList, setTeamList] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamStatusFilter, setTeamStatusFilter] = useState('all');
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState('');

  // Correction Requests state
  const [corrections, setCorrections] = useState([]);
  const [correctionFilter, setCorrectionFilter] = useState('pending');
  const [correctionsLoading, setCorrectionsLoading] = useState(false);

  // Manual Override Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null); // row item
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Decline Correction Modal
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submittingDecline, setSubmittingDecline] = useState(false);

  // View Employee Month Modal
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarTargetEmployee, setCalendarTargetEmployee] = useState(null);
  const [employeeMonthData, setEmployeeMonthData] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Fetch Team Attendance
  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError('');
    try {
      const data = await getTeamAttendance({
        date: selectedDate,
        search: teamSearch.trim(),
        status: teamStatusFilter,
      });
      setTeamList(data.team || []);
    } catch (err) {
      setTeamError(err.response?.data?.message || 'Failed to fetch team attendance');
    } finally {
      setTeamLoading(false);
    }
  }, [selectedDate, teamSearch, teamStatusFilter]);

  // Fetch Corrections
  const fetchCorrectionRequests = useCallback(async () => {
    setCorrectionsLoading(true);
    try {
      const data = await getCorrections({ status: correctionFilter });
      setCorrections(data.corrections || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to fetch correction requests', 'error');
    } finally {
      setCorrectionsLoading(false);
    }
  }, [correctionFilter, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTeam();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchTeam]);

  useEffect(() => {
    if (activeTab === 'corrections') {
      fetchCorrectionRequests();
    }
  }, [activeTab, fetchCorrectionRequests]);

  // Handle Manual Override Modal Open
  function handleOpenOverride(item) {
    setOverrideTarget(item);
    setOverrideStatus(item.status !== 'not_marked' ? item.status : 'present');
    setOverrideReason('');
    setIsOverrideModalOpen(true);
  }

  // Submit Manual Override
  async function handleOverrideSubmit(e) {
    e.preventDefault();
    if (!overrideReason.trim()) {
      showToast('Please provide an override reason for audit logging', 'error');
      return;
    }
    setSubmittingOverride(true);
    try {
      await overrideAttendance(overrideTarget.attendance_id || 'new', {
        status: overrideStatus,
        reason: overrideReason.trim(),
        user_id: overrideTarget.user_id,
        date: selectedDate,
      });
      showToast('Attendance successfully overridden and logged!', 'success');
      setIsOverrideModalOpen(false);
      fetchTeam();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to override attendance', 'error');
    } finally {
      setSubmittingOverride(false);
    }
  }

  // Handle Approve Correction
  async function handleApproveCorrection(item) {
    try {
      await reviewCorrection(item.id, { action: 'approve' });
      showToast(`Correction approved for ${item.employee_name}!`, 'success');
      fetchCorrectionRequests();
      fetchTeam();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to approve correction', 'error');
    }
  }

  // Handle Decline Correction Modal Open
  function handleOpenDeclineModal(item) {
    setDeclineTarget(item);
    setDeclineReason('');
    setIsDeclineModalOpen(true);
  }

  // Submit Decline Correction
  async function handleDeclineSubmit(e) {
    e.preventDefault();
    if (!declineReason.trim()) {
      showToast('A reason is mandatory when declining a request', 'error');
      return;
    }
    setSubmittingDecline(true);
    try {
      await reviewCorrection(declineTarget.id, {
        action: 'decline',
        decline_reason: declineReason.trim(),
      });
      showToast('Correction request declined.', 'info');
      setIsDeclineModalOpen(false);
      fetchCorrectionRequests();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to decline correction', 'error');
    } finally {
      setSubmittingDecline(false);
    }
  }

  // View Employee Monthly Calendar
  async function handleOpenCalendarModal(emp) {
    setCalendarTargetEmployee(emp);
    setIsCalendarModalOpen(true);
    setCalendarLoading(true);
    try {
      const now = new Date();
      const data = await getMonthlyAttendance({
        user_id: emp.user_id || emp.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
      setEmployeeMonthData(data);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load monthly attendance', 'error');
    } finally {
      setCalendarLoading(false);
    }
  }

  // Summary counts for selected date
  const counts = teamList.reduce(
    (acc, emp) => {
      acc[emp.status] = (acc[emp.status] || 0) + 1;
      return acc;
    },
    { present: 0, half_day: 0, travel: 0, wfh: 0, absent: 0, not_marked: 0 }
  );

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Workforce Attendance Management</h1>
          <p className="page-subtitle text-muted">
            Monitor real-time team presence, review correction requests, and perform audit-logged overrides.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="tab-pill-switcher">
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <Users size={14} aria-hidden="true" /> Daily Team Status
          </button>
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'corrections' ? 'active' : ''}`}
            onClick={() => setActiveTab('corrections')}
          >
            <Hourglass size={14} aria-hidden="true" /> Correction Requests
          </button>
        </div>
      </div>

      {activeTab === 'team' ? (
        <>
          {/* Controls Bar: Date Picker, Search, Status Filter */}
          <div className="page-controls card">
            <div className="date-picker-group">
              <label htmlFor="att-date-select" className="filter-label">
                Date:
              </label>
              <input
                id="att-date-select"
                type="date"
                className="date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
              >
                Today
              </button>
            </div>

            <div className="search-box">
              <Search className="search-icon" size={14} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search team member..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
              {teamSearch && (
                <button className="search-clear" onClick={() => setTeamSearch('')}>
                  ×
                </button>
              )}
            </div>

            <div className="filter-group">
              <label htmlFor="team-status-filter" className="filter-label">
                Status:
              </label>
              <select
                id="team-status-filter"
                className="filter-select"
                value={teamStatusFilter}
                onChange={(e) => setTeamStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="present">Present Only</option>
                <option value="half_day">Half-Day Only</option>
                <option value="travel">Travel Only</option>
                <option value="wfh">Work From Home Only</option>
                <option value="absent">Absent Only</option>
                <option value="not_marked">Not Marked</option>
              </select>
            </div>
          </div>

          {/* Daily Status KPI Bar */}
          <div className="attendance-kpi-grid">
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">Total Staff</span>
              <div className="kpi-value">{teamList.length}</div>
            </div>
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">Present</span>
              <div className="kpi-value text-success">{counts.present || 0}</div>
            </div>
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">Half-Day</span>
              <div className="kpi-value text-warning">{counts.half_day || 0}</div>
            </div>
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">On Travel</span>
              <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{counts.travel || 0}</div>
            </div>
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">Work From Home</span>
              <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{counts.wfh || 0}</div>
            </div>
            <div className="kpi-card card">
              <span className="kpi-title text-muted text-xs">Not Marked / Absent</span>
              <div className="kpi-value text-danger">{(counts.not_marked || 0) + (counts.absent || 0)}</div>
            </div>
          </div>

          {/* Team Table */}
          <div className="table-card card" style={{ marginTop: 'var(--space-4)' }}>
            {teamLoading ? (
              <div className="state-container">
                <span className="spinner" />
                <p className="text-muted">Loading team attendance for {selectedDate}...</p>
              </div>
            ) : teamError ? (
              <div className="state-container">
                <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
                <p className="text-danger">{teamError}</p>
                <button className="btn btn-ghost btn-sm" onClick={fetchTeam}>
                  Try Again
                </button>
              </div>
            ) : teamList.length === 0 ? (
              <div className="state-container">
                <Users className="state-icon" size={40} aria-hidden="true" />
                <h3>No employee attendance records found</h3>
                <p className="text-muted text-sm">Try clearing your search query or filter.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Designation</th>
                      <th>Attendance Status</th>
                      <th>Marked At</th>
                      <th>Audit / Override</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamList.map((emp) => (
                      <tr key={emp.user_id}>
                        <td>
                          <span className="emp-id-badge">{emp.employee_id}</span>
                        </td>
                        <td>
                          <div className="emp-name-col">
                            <strong className="emp-fullname">{emp.name}</strong>
                            <span className="emp-email text-muted text-sm">{emp.email}</span>
                          </div>
                        </td>
                        <td>
                          <span className="emp-designation">{emp.designation || '—'}</span>
                        </td>
                        <td>
                          <span className={`status-pill status-${emp.status}`}>
                            {emp.status === 'not_marked' ? 'Not Marked' : emp.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">
                            {emp.marked_at
                              ? new Date(emp.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </span>
                        </td>
                        <td>
                          <div className="remarks-cell">
                            {emp.is_admin_override && (
                              <span className="override-badge text-xs" title={emp.override_reason}>
                                <Zap size={11} aria-hidden="true" /> Override ({emp.override_reason})
                              </span>
                            )}
                            {emp.correction_status === 'pending' && (
                              <span className="status-pill status-unpaid text-xs">
                                <Hourglass size={11} aria-hidden="true" /> Correction: {emp.correction_requested_status}
                              </span>
                            )}
                            {!emp.is_admin_override && emp.correction_status === 'none' && '—'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-buttons-group">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              title="Manual Override"
                              onClick={() => handleOpenOverride(emp)}
                            >
                              <Zap size={13} aria-hidden="true" /> Override
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="View Monthly Calendar"
                              onClick={() => handleOpenCalendarModal(emp)}
                            >
                              <CalendarDays size={13} aria-hidden="true" /> Month
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Correction Requests Tab */
        <div className="corrections-container">
          <div className="page-controls card">
            <div className="filter-group">
              <label htmlFor="corr-status-select" className="filter-label">
                Filter Requests:
              </label>
              <select
                id="corr-status-select"
                className="filter-select"
                value={correctionFilter}
                onChange={(e) => setCorrectionFilter(e.target.value)}
              >
                <option value="pending">Pending Only</option>
                <option value="approved">Approved Only</option>
                <option value="declined">Declined Only</option>
                <option value="all">All Requests</option>
              </select>
            </div>
          </div>

          <div className="table-card card" style={{ marginTop: 'var(--space-4)' }}>
            {correctionsLoading ? (
              <div className="state-container">
                <span className="spinner" />
                <p className="text-muted">Loading correction requests...</p>
              </div>
            ) : corrections.length === 0 ? (
              <div className="state-container">
                <Hourglass className="state-icon" size={40} aria-hidden="true" />
                <h3>No correction requests found</h3>
                <p className="text-muted text-sm">
                  {correctionFilter === 'pending'
                    ? 'All employee attendance correction requests are up to date.'
                    : 'No requests match the selected filter.'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Current Status</th>
                      <th>Requested Status</th>
                      <th>Employee Reason</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="emp-name-col">
                            <strong className="emp-fullname">{item.employee_name}</strong>
                            <span className="emp-id-badge" style={{ width: 'fit-content' }}>
                              {item.employee_id}
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong className="calendar-date-cell">
                            {new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </strong>
                        </td>
                        <td>
                          <span className={`status-pill status-${item.current_status}`}>
                            {item.current_status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <strong className="salary-rate-text">
                            {item.correction_requested_status?.toUpperCase()}
                          </strong>
                        </td>
                        <td>
                          <span className="text-sm">{item.correction_reason}</span>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              item.correction_status === 'approved'
                                ? 'status-active'
                                : item.correction_status === 'declined'
                                ? 'status-inactive'
                                : 'status-unpaid'
                            }`}
                          >
                            {item.correction_status.toUpperCase()}
                          </span>
                          {item.correction_declined_reason && (
                            <span className="text-muted text-xs block" style={{ marginTop: '2px' }}>
                              Reason: {item.correction_declined_reason}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {item.correction_status === 'pending' && (
                            <div className="action-buttons-group">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleApproveCorrection(item)}
                              >
                                <Check size={13} aria-hidden="true" /> Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleOpenDeclineModal(item)}
                              >
                                <X size={13} aria-hidden="true" /> Decline
                              </button>
                            </div>
                          )}
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

      {/* ─── Modal: Manual Attendance Override ────────────────────────────── */}
      <Modal
        isOpen={isOverrideModalOpen}
        onClose={() => !submittingOverride && setIsOverrideModalOpen(false)}
        title={`Manual Attendance Override (${overrideTarget?.employee_id})`}
      >
        <form onSubmit={handleOverrideSubmit} className="modal-form">
          <div className="alert alert-info">
            <Info size={16} aria-hidden="true" />
            <span>Manual overrides are audit-logged with your Admin ID, timestamp, and justification reason.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Employee Name</label>
            <input type="text" disabled value={`${overrideTarget?.name} (${overrideTarget?.employee_id})`} />
          </div>

          <div className="form-group">
            <label className="form-label">Target Date</label>
            <input type="text" disabled value={selectedDate} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="override-status-select">
              New Attendance Status *
            </label>
            <select
              id="override-status-select"
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value)}
              disabled={submittingOverride}
            >
              <option value="present">Present (Full Day)</option>
              <option value="half_day">Half-Day (50%)</option>
              <option value="travel">On Duty / Travel</option>
              <option value="wfh">Work From Home</option>
              <option value="absent">Absent / Unmarked</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="override-reason-input">
              Override Reason / Justification *
            </label>
            <textarea
              id="override-reason-input"
              rows="3"
              required
              placeholder="e.g. Employee was on client site meeting with approved email note..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              disabled={submittingOverride}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsOverrideModalOpen(false)}
              disabled={submittingOverride}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingOverride}>
              {submittingOverride ? <span className="spinner" /> : null}
              {submittingOverride ? 'Saving Override...' : 'Confirm Override'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal: Decline Correction Request ───────────────────────────── */}
      <Modal
        isOpen={isDeclineModalOpen}
        onClose={() => !submittingDecline && setIsDeclineModalOpen(false)}
        title="Decline Correction Request"
      >
        <form onSubmit={handleDeclineSubmit} className="modal-form">
          <p className="text-sm text-muted">
            Please provide a reason for declining <strong>{declineTarget?.employee_name}</strong>'s request. This will be shown to the employee.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="decline-reason-input">
              Decline Reason *
            </label>
            <textarea
              id="decline-reason-input"
              rows="3"
              required
              placeholder="e.g. Timesheet logs show no working activity on this date..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              disabled={submittingDecline}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsDeclineModalOpen(false)}
              disabled={submittingDecline}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={submittingDecline}>
              {submittingDecline ? <span className="spinner" /> : null}
              Confirm Decline
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal: View Employee Monthly Calendar ───────────────────────── */}
      <Modal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        title={`Monthly Attendance: ${calendarTargetEmployee?.name} (${calendarTargetEmployee?.employee_id})`}
        maxWidth="740px"
      >
        {calendarLoading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading employee calendar...</p>
          </div>
        ) : employeeMonthData?.days ? (
          <div className="employee-month-modal-body">
            {employeeMonthData.summary && (
              <div className="attendance-kpi-grid" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="kpi-card card">
                  <span className="kpi-title text-muted text-xs">Present</span>
                  <div className="kpi-value text-success">{employeeMonthData.summary.present_days}</div>
                </div>
                <div className="kpi-card card">
                  <span className="kpi-title text-muted text-xs">Half-Day</span>
                  <div className="kpi-value text-warning">{employeeMonthData.summary.half_days}</div>
                </div>
                <div className="kpi-card card">
                  <span className="kpi-title text-muted text-xs">Travel</span>
                  <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{employeeMonthData.summary.travel_days}</div>
                </div>
                <div className="kpi-card card">
                  <span className="kpi-title text-muted text-xs">WFH</span>
                  <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{employeeMonthData.summary.wfh_days}</div>
                </div>
                <div className="kpi-card card">
                  <span className="kpi-title text-muted text-xs">Absent/Unmarked</span>
                  <div className="kpi-value text-danger">{employeeMonthData.summary.absent_days + employeeMonthData.summary.not_marked_days}</div>
                </div>
              </div>
            )}

            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Marked Time</th>
                    <th>Audit Details</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeMonthData.days.map((d) => (
                    <tr key={d.date}>
                      <td>
                        <strong>{new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong>
                      </td>
                      <td>
                        <span className="text-muted text-sm">{d.day_of_week}</span>
                      </td>
                      <td>
                        {d.is_holiday ? (
                          <span className="status-pill status-holiday">
                            <Palmtree size={11} aria-hidden="true" /> {d.holiday_name}
                          </span>
                        ) : d.is_weekend ? (
                          <span className="status-pill status-weekend">
                            <CalendarOff size={11} aria-hidden="true" /> Weekend
                          </span>
                        ) : d.attendance ? (
                          <span className={`status-pill status-${d.attendance.status}`}>
                            {d.attendance.status.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">{d.effective_status}</span>
                        )}
                      </td>
                      <td>
                        <span className="text-sm">
                          {d.attendance?.marked_at ? new Date(d.attendance.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </td>
                      <td>
                        {d.attendance?.is_admin_override ? (
                          <span className="override-badge text-xs">
                            <Zap size={11} aria-hidden="true" /> {d.attendance.override_reason}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="modal-actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => setIsCalendarModalOpen(false)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
