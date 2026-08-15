import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Check, Copy, KeyRound, RefreshCw, ShieldAlert, TriangleAlert,
} from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { listResetRequests, resolveResetRequest } from '../api/passwordResetApi';
import './AdminPasswordResetsPage.css';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

const STATUS_PILL = {
  pending: 'status-unpaid',
  resolved: 'status-active',
  expired: 'status-inactive',
};

export default function AdminPasswordResetsPage() {
  const { showToast } = useToast();

  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  // The generated password is held in memory only, for the life of this modal.
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listResetRequests({ status, limit: 50 });
      setRequests(data.requests || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load password reset requests');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function handleResolve(request) {
    setResolvingId(request.id);
    try {
      const data = await resolveResetRequest(request.id);
      setIssued({ ...data, request });
      setCopied(false);
      fetchRequests();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to generate temporary password', 'error');
    } finally {
      setResolvingId(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(issued.temp_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy automatically — please select and copy manually.', 'error');
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Password Reset Requests</h1>
          <p className="page-subtitle text-muted">
            Employees can't reset their own passwords — issue a temporary one here and pass it to
            them directly.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={fetchRequests} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="page-controls card">
        <div className="reset-filter-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`emp-tab-btn ${status === f.value ? 'active' : ''}`}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-muted text-sm">
          Showing: <strong>{requests.length}</strong>
        </span>
      </div>

      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading reset requests…</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={fetchRequests}>Try Again</button>
          </div>
        ) : requests.length === 0 ? (
          <div className="state-container">
            <KeyRound className="state-icon" size={40} aria-hidden="true" />
            <h3>No {status === 'all' ? '' : status} requests</h3>
            <p className="text-muted text-sm">
              Requests appear here when an employee uses “Forgot password?” on the login screen.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th>Resolved By</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="emp-name-col">
                        <strong className="emp-fullname">{r.employee_name}</strong>
                        <span className="emp-id-badge" style={{ width: 'fit-content' }}>
                          {r.employee_id}
                        </span>
                      </div>
                    </td>
                    <td><span className="emp-designation">{r.designation || '—'}</span></td>
                    <td>
                      <span className="text-sm">
                        {new Date(r.requested_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${STATUS_PILL[r.status] || ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td><span className="text-sm text-muted">{r.resolved_by_name || '—'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      {r.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleResolve(r)}
                          disabled={resolvingId === r.id}
                        >
                          {resolvingId === r.id
                            ? <span className="spinner" />
                            : <><KeyRound size={13} aria-hidden="true" /> Generate temporary password</>}
                        </button>
                      ) : (
                        <span className="text-muted text-xs">
                          {r.status === 'resolved' ? 'Password issued' : 'Expired — ask for a new request'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── One-time temporary password reveal ─────────────────────── */}
      <Modal
        isOpen={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Temporary password generated"
        maxWidth="520px"
      >
        {issued && (
          <div className="temp-pass-body">
            <div className="temp-pass-warning">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <strong>Shown only once.</strong> This password is not stored and cannot be
                retrieved again. Copy it now and pass it to the employee directly.
              </div>
            </div>

            <div className="temp-pass-target">
              <span className="text-muted text-xs">FOR</span>
              <strong>{issued.employee?.name}</strong>
              <span className="emp-id-badge">{issued.employee?.employee_id}</span>
            </div>

            <div className="temp-pass-value-row">
              <code className="temp-pass-value">{issued.temp_password}</code>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCopy}>
                {copied
                  ? <><Check size={14} aria-hidden="true" /> Copied</>
                  : <><Copy size={14} aria-hidden="true" /> Copy</>}
              </button>
            </div>

            <p className="temp-pass-note">
              <TriangleAlert size={14} aria-hidden="true" />
              Expires in {issued.expires_in_hours} hours if unused. The employee will be forced to
              choose a new password the moment they sign in.
            </p>

            <div className="modal-actions-row">
              <button type="button" className="btn btn-primary" onClick={() => setIssued(null)}>
                I've copied it — close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
