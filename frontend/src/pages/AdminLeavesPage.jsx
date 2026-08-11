import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Info,
  Palmtree,
  Search,
  X,
} from 'lucide-react';
import {
  getLeaveApplications,
  reviewLeaveApplication,
  getLeaveBalances,
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

  // Review inputs
  const [adminNotes, setAdminNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Employee balances modal data
  const [employeeBalances, setEmployeeBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

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
  function handleOpenApprove(app) {
    setSelectedApplication(app);
    setAdminNotes('');
    setIsApproveModalOpen(true);
  }

  // Open Decline Modal
  function handleOpenDecline(app) {
    setSelectedApplication(app);
    setDeclineReason('');
    setIsDeclineModalOpen(true);
  }

  // Open Balances Modal
  async function handleOpenBalances(app) {
    setSelectedApplication(app);
    setIsBalancesModalOpen(true);
    setBalancesLoading(true);
    try {
      const data = await getLeaveBalances({
        user_id: app.user_id,
        year: new Date(app.start_date).getFullYear(),
      });
      setEmployeeBalances(data.balances || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load employee balances', 'error');
    } finally {
      setBalancesLoading(false);
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
            Please provide a mandatory reason for declining this request. No leave balance will be deducted.
          </p>

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
          </div>
        )}

        <div className="modal-actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => setIsBalancesModalOpen(false)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
