import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Check,
  History,
  Info,
  Palmtree,
  PlayCircle,
  Search,
  X,
} from 'lucide-react';
import {
  getLeaveApplications,
  reviewLeaveApplication,
  getLeaveBalances,
  getLeaveLedger,
  runAccrual,
} from '../api/leaveApi';
import { getLeaveTypes } from '../api/leaveTypeApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './AdminLeavesPage.css';

export default function AdminLeavesPage() {
  const { showToast } = useToast();

  const [applications, setApplications] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modals
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isBalancesModalOpen, setIsBalancesModalOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [currentBalance, setCurrentBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Review inputs
  const [adminNotes, setAdminNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Employee balances modal data
  const [employeeBalances, setEmployeeBalances] = useState([]);
  const [employeeLedger, setEmployeeLedger] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Attendance Accrual modal state
  const [isAccrualModalOpen, setIsAccrualModalOpen] = useState(false);
  const [accrualPeriod, setAccrualPeriod] = useState('');
  const [accrualRunning, setAccrualRunning] = useState(false);
  const [accrualResult, setAccrualResult] = useState(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.leave_type_id = typeFilter;

      const data = await getLeaveApplications(params);
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch leave applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    async function loadTypes() {
      try {
        const data = await getLeaveTypes({ include_inactive: true });
        setLeaveTypes(data.leave_types || []);
      } catch (err) {
        console.error('Failed to load leave types', err);
      }
    }
    loadTypes();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchApplications();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchApplications]);

  // Open Approve Modal
  async function handleOpenApprove(app) {
    setSelectedApplication(app);
    setAdminNotes('');
    setIsApproveModalOpen(true);
    if (app.is_paid) {
      setBalanceLoading(true);
      setCurrentBalance(null);
      try {
        const year = new Date(app.start_date).getFullYear();
        const data = await getLeaveBalances({ user_id: app.user_id, year });
        const bal = data.balances?.find(b => b.leave_type_id === app.leave_type_id);
        setCurrentBalance(bal || null);
      } catch (err) {
        console.error('Failed to fetch balance', err);
      } finally {
        setBalanceLoading(false);
      }
    }
  }

  // Open Decline Modal
  async function handleOpenDecline(app) {
    setSelectedApplication(app);
    setDeclineReason('');
    setIsDeclineModalOpen(true);
    if (app.is_paid) {
      setBalanceLoading(true);
      setCurrentBalance(null);
      try {
        const year = new Date(app.start_date).getFullYear();
        const data = await getLeaveBalances({ user_id: app.user_id, year });
        const bal = data.balances?.find(b => b.leave_type_id === app.leave_type_id);
        setCurrentBalance(bal || null);
      } catch (err) {
        console.error('Failed to fetch balance', err);
      } finally {
        setBalanceLoading(false);
      }
    }
  }

  // Open Balances Modal
  async function handleOpenBalances(app) {
    setSelectedApplication(app);
    setIsBalancesModalOpen(true);
    setBalancesLoading(true);
    try {
      const year = new Date(app.start_date).getFullYear();
      const [balancesData, ledgerData] = await Promise.all([
        getLeaveBalances({ user_id: app.user_id, year }),
        getLeaveLedger({ user_id: app.user_id, year }),
      ]);
      setEmployeeBalances(balancesData.balances || []);
      setEmployeeLedger(ledgerData.ledger || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load employee balances', 'error');
    } finally {
      setBalancesLoading(false);
    }
  }

  // Open Attendance Accrual Modal
  function handleOpenAccrualModal() {
    setAccrualResult(null);
    setAccrualPeriod('');
    setIsAccrualModalOpen(true);
  }

  // Run monthly accrual for all active employees (or defaults to most recently completed month)
  async function handleRunAccrual() {
    setAccrualRunning(true);
    setAccrualResult(null);
    try {
      const data = await runAccrual(accrualPeriod ? { period: accrualPeriod } : {});
      setAccrualResult(data);
      showToast(
        `Accrual run complete for ${data.period}: ${data.bonusesAwarded} bonus(es) awarded across ${data.evaluated} employee(s).`,
        'success'
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to run attendance accrual', 'error');
    } finally {
      setAccrualRunning(false);
    }
  }

  // Submit Approval
  async function handleApproveSubmit(e) {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await reviewLeaveApplication(selectedApplication.id, {
        status: 'approved',
        admin_notes: adminNotes.trim() || undefined,
      });
      showToast(`Leave application approved for ${selectedApplication.employee_name}!`, 'success');
      setIsApproveModalOpen(false);
      fetchApplications();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to approve leave application', 'error');
    } finally {
      setSubmittingReview(false);
    }
  }

  // Submit Decline
  async function handleDeclineSubmit(e) {
    e.preventDefault();
    if (!declineReason.trim()) {
      showToast('A decline reason is mandatory', 'error');
      return;
    }
    setSubmittingReview(true);
    try {
      await reviewLeaveApplication(selectedApplication.id, {
        status: 'declined',
        decline_reason: declineReason.trim(),
      });
      showToast(`Leave application declined.`, 'info');
      setIsDeclineModalOpen(false);
      fetchApplications();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to decline leave application', 'error');
    } finally {
      setSubmittingReview(false);
    }
  }

  // Filter applications by search text (client-side for responsiveness)
  const filteredApplications = applications.filter((app) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      app.employee_name?.toLowerCase().includes(q) ||
      app.employee_id?.toLowerCase().includes(q) ||
      app.leave_type_name?.toLowerCase().includes(q) ||
      app.reason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Leave Request Management</h1>
          <p className="page-subtitle text-muted">
            Review and adjudicate staff leave applications. Approved paid leaves automatically deduct from employee balances.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleOpenAccrualModal}
        >
          <Calculator size={15} aria-hidden="true" /> Attendance Accrual
        </button>
      </div>

      {/* Controls Bar: Search, Status Filter, Type Filter */}
      <div className="page-controls card">
        <div className="search-box">
          <Search className="search-icon" size={14} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by employee, ID, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              ×
            </button>
          )}
        </div>

        <div className="filter-group">
          <label htmlFor="leave-status-filter" className="filter-label">
            Status:
          </label>
          <select
            id="leave-status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">Pending Only</option>
            <option value="approved">Approved Only</option>
            <option value="declined">Declined Only</option>
            <option value="all">All Applications</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="leave-type-filter" className="filter-label">
            Leave Type:
          </label>
          <select
            id="leave-type-filter"
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Applications Table */}
      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading leave applications...</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={fetchApplications}>
              Try Again
            </button>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="state-container">
            <Palmtree className="state-icon" size={40} aria-hidden="true" />
            <h3>No leave applications found</h3>
            <p className="text-muted text-sm">
              {statusFilter === 'pending'
                ? 'All employee leave requests have been reviewed.'
                : 'No leave applications match your search criteria.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>Date Range</th>
                  <th>Working Days</th>
                  <th>Employee Reason</th>
                  <th>Status</th>
                  <th>Reviewer Remarks</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div className="emp-name-col">
                        <strong className="emp-fullname">{app.employee_name}</strong>
                        <span className="emp-id-badge" style={{ width: 'fit-content' }}>
                          {app.employee_id}
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong className="text-sm">{app.leave_type_name}</strong>
                      <span className="text-muted text-xs block">
                        {app.is_paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td>
                      <strong className="calendar-date-cell">
                        {new Date(app.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        {' → '}
                        {new Date(app.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </strong>
                    </td>
                    <td>
                      <span className="badge-working-days">
                        {app.working_days_count} day(s)
                      </span>
                    </td>
                    <td>
                      <span className="text-sm">{app.reason}</span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          app.status === 'approved'
                            ? 'status-active'
                            : app.status === 'declined'
                            ? 'status-inactive'
                            : 'status-unpaid'
                        }`}
                      >
                        {app.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-muted">
                        {app.decline_reason
                          ? `Decline: ${app.decline_reason}`
                          : app.admin_notes
                          ? app.admin_notes
                          : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-group">
                        {app.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              title="Approve Leave"
                              onClick={() => handleOpenApprove(app)}
                            >
                              <Check size={13} aria-hidden="true" /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              title="Decline Leave"
                              onClick={() => handleOpenDecline(app)}
                            >
                              <X size={13} aria-hidden="true" /> Decline
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="View Leave Balances"
                          onClick={() => handleOpenBalances(app)}
                        >
                          <BarChart3 size={13} aria-hidden="true" /> Balances
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

      {/* ─── Modal: Approve Leave Request ────────────────────────────────── */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => !submittingReview && setIsApproveModalOpen(false)}
        title={`Approve Leave: ${selectedApplication?.employee_name}`}
        maxWidth="500px"
      >
        <form onSubmit={handleApproveSubmit} className="modal-form">
          <div className="alert alert-info">
            <Info size={16} aria-hidden="true" />
            <span>
              Approving this request will automatically deduct <strong>{selectedApplication?.working_days_count} day(s)</strong> from the employee's {selectedApplication?.leave_type_name} balance.
            </span>
          </div>

          {selectedApplication?.is_paid && (
            <div className="alert alert-warning" style={{ marginTop: 'var(--space-3)' }}>
              <Calculator size={16} aria-hidden="true" />
              <span>
                {balanceLoading ? (
                  'Fetching current balance...'
                ) : currentBalance ? (
                  <>
                    Employee currently has <strong>{currentBalance.remaining} day(s)</strong> remaining.
                    After approval, the balance will be <strong>{currentBalance.remaining - selectedApplication.working_days_count} day(s)</strong>.
                  </>
                ) : (
                  'Could not fetch current balance.'
                )}
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Date Range</label>
            <input
              type="text"
              disabled
              value={`${selectedApplication?.start_date ? new Date(selectedApplication.start_date).toLocaleDateString('en-IN') : ''} to ${selectedApplication?.end_date ? new Date(selectedApplication.end_date).toLocaleDateString('en-IN') : ''} (${selectedApplication?.working_days_count} working days)`}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="approve-notes-input">
              Admin Notes / Approval Remarks (Optional)
            </label>
            <input
              id="approve-notes-input"
              type="text"
              placeholder="e.g. Approved as requested..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              disabled={submittingReview}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={submittingReview}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingReview}>
              {submittingReview ? <span className="spinner" /> : null}
              {submittingReview ? 'Approving...' : 'Confirm Approval'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal: Decline Leave Request ────────────────────────────────── */}
      <Modal
        isOpen={isDeclineModalOpen}
        onClose={() => !submittingReview && setIsDeclineModalOpen(false)}
        title={`Decline Leave: ${selectedApplication?.employee_name}`}
        maxWidth="500px"
      >
        <form onSubmit={handleDeclineSubmit} className="modal-form">
          <p className="text-muted text-sm">
            Please provide a reason for declining this request. This will be visible to the employee.
          </p>

          {selectedApplication?.is_paid && (
            <div className="alert alert-info" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <Calculator size={16} aria-hidden="true" />
              <span>
                {balanceLoading ? (
                  'Fetching current balance...'
                ) : currentBalance ? (
                  <>
                    Employee currently has <strong>{currentBalance.remaining} day(s)</strong> remaining.
                  </>
                ) : (
                  'Could not fetch current balance.'
                )}
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="admin-decline-reason">
              Decline Reason *
            </label>
            <textarea
              id="admin-decline-reason"
              rows="3"
              required
              placeholder="e.g. Inadequate team coverage for scheduled critical product release..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              disabled={submittingReview}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsDeclineModalOpen(false)}
              disabled={submittingReview}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={submittingReview}>
              {submittingReview ? <span className="spinner" /> : null}
              {submittingReview ? 'Declining...' : 'Confirm Decline'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal: View Employee Leave Balances ─────────────────────────── */}
      <Modal
        isOpen={isBalancesModalOpen}
        onClose={() => setIsBalancesModalOpen(false)}
        title={`Leave Balances: ${selectedApplication?.employee_name} (${selectedApplication?.employee_id})`}
        maxWidth="600px"
      >
        {balancesLoading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading employee balances...</p>
          </div>
        ) : (
          <div className="employee-balances-modal-body">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Leave Category</th>
                    <th>Compensation</th>
                    <th>Allotted</th>
                    <th>Used</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeBalances.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                      </td>
                      <td>
                        <span className={`status-pill ${b.is_paid ? 'status-paid' : 'status-unpaid'}`}>
                          {b.is_paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td>{b.allotted} days</td>
                      <td>{b.used} days</td>
                      <td>
                        <strong className="salary-rate-text">{b.is_paid ? `${b.remaining} days` : '—'}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ledger History — why the balance is what it is */}
            <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)', marginTop: 'var(--space-6)' }}>
              <History size={15} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 'var(--space-2)' }} />
              Balance History
            </h3>
            {employeeLedger.length === 0 ? (
              <p className="text-muted text-sm">No ledger entries for this year yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Leave Type</th>
                      <th>Transaction</th>
                      <th>Amount</th>
                      <th>Balance</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeLedger.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <span className="text-sm">{new Date(entry.created_at).toLocaleDateString('en-IN')}</span>
                        </td>
                        <td>
                          <span className="text-sm">{entry.leave_type_name}</span>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              entry.entry_type === 'ATTENDANCE_BONUS'
                                ? 'status-active'
                                : entry.entry_type === 'LEAVE_TAKEN'
                                ? 'status-unpaid'
                                : 'status-weekend'
                            }`}
                          >
                            {entry.entry_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <strong className={entry.entry_type === 'LEAVE_TAKEN' ? 'text-danger' : 'text-success'}>
                            {entry.entry_type === 'LEAVE_TAKEN' ? '−' : '+'}{entry.amount}
                          </strong>
                        </td>
                        <td>
                          <strong className="salary-rate-text">{entry.resulting_balance}</strong>
                        </td>
                        <td>
                          <span className="text-muted text-xs">{entry.note || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => setIsBalancesModalOpen(false)}>
            Close
          </button>
        </div>
      </Modal>

      {/* ─── Modal: Attendance Accrual — Manual Trigger / Backfill ────────── */}
      <Modal
        isOpen={isAccrualModalOpen}
        onClose={() => !accrualRunning && setIsAccrualModalOpen(false)}
        title={
          <span className="modal-title-with-icon">
            <Calculator size={18} aria-hidden="true" /> Attendance-Based Leave Accrual
          </span>
        }
        maxWidth="600px"
      >
        <div className="modal-form">
          <div className="alert alert-info">
            <Info size={16} aria-hidden="true" />
            <span>
              Every active employee is evaluated for the selected month: <strong>&ge;70% attendance</strong> earns
              +1 paid leave, credited the 1st of the following month. This runs automatically every night, so use
              this only to backfill a missed run or reprocess a specific month. Safe to re-run — already-processed
              months are skipped.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="accrual-period-input">
              Month to Evaluate (defaults to the most recently completed month)
            </label>
            <input
              id="accrual-period-input"
              type="month"
              value={accrualPeriod}
              onChange={(e) => setAccrualPeriod(e.target.value)}
              disabled={accrualRunning}
            />
          </div>

          <div className="modal-actions-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunAccrual}
              disabled={accrualRunning}
            >
              {accrualRunning ? <span className="spinner" /> : <PlayCircle size={15} aria-hidden="true" />}
              {accrualRunning ? 'Running...' : 'Run Accrual'}
            </button>
          </div>

          {accrualResult && (
            <div className="employee-balances-modal-body">
              <div className="alert alert-info">
                <Info size={16} aria-hidden="true" />
                <span>
                  <strong>{accrualResult.period}</strong>: evaluated {accrualResult.evaluated} employee(s),
                  awarded <strong>{accrualResult.bonusesAwarded}</strong> bonus(es).
                </span>
              </div>

              {accrualResult.results?.length > 0 && (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee ID</th>
                        <th>Outcome</th>
                        <th>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accrualResult.results.map((r) => (
                        <tr key={r.userId}>
                          <td>{r.userId}</td>
                          <td>
                            {r.bonusAwarded ? (
                              <span className="status-pill status-active">Bonus Awarded</span>
                            ) : r.skipped ? (
                              <span className="status-pill status-weekend">Skipped: {r.reason}</span>
                            ) : (
                              <span className="status-pill status-unpaid">No Bonus</span>
                            )}
                          </td>
                          <td>{r.attendancePct != null ? `${r.attendancePct}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsAccrualModalOpen(false)}
              disabled={accrualRunning}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
