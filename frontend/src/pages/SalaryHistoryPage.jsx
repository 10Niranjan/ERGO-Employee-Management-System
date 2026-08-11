import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { getSalaryHistory } from '../api/salaryApi';
import './SalaryManagementPage.css';

export default function SalaryHistoryPage() {
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGlobalHistory = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await getSalaryHistory({ page, limit: 15 });
      setHistory(data.history || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 15, pages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch global salary history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalHistory(1);
  }, [fetchGlobalHistory]);

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Salary Revision Audit Log</h1>
          <p className="page-subtitle text-muted">
            Immutable company-wide audit trail of all employee per-day salary rate adjustments.
          </p>
        </div>
        <Link to="/admin/salaries" className="btn btn-ghost">
          <ArrowLeft size={15} aria-hidden="true" /> Back to Salary Rates
        </Link>
      </div>

      {/* Main Table Card */}
      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading audit records...</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => fetchGlobalHistory(pagination.page)}>
              Try Again
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="state-container">
            <History className="state-icon" size={40} aria-hidden="true" />
            <h3>No salary revisions recorded</h3>
            <p className="text-muted text-sm">
              Any future salary rate modifications will automatically be recorded here.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Previous Rate</th>
                  <th>New Rate</th>
                  <th>Difference</th>
                  <th>Authorized By</th>
                  <th>Audit Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const oldR = parseFloat(item.old_rate);
                  const newR = parseFloat(item.new_rate);
                  const diff = newR - oldR;
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="text-sm">
                          {new Date(item.changed_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td>
                        <div className="emp-name-col">
                          <strong className="emp-fullname">{item.employee_name}</strong>
                          <span className="emp-id-badge" style={{ width: 'fit-content', marginTop: '2px' }}>
                            {item.employee_id}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm">{item.designation || '—'}</span>
                      </td>
                      <td>
                        <span className="text-muted text-sm">
                          ₹{oldR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td>
                        <strong className="salary-rate-text">
                          ₹{newR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            diff > 0 ? 'status-active' : diff < 0 ? 'status-inactive' : 'status-paid'
                          }`}
                        >
                          {diff > 0 ? `+₹${diff.toFixed(2)}` : diff < 0 ? `-₹${Math.abs(diff).toFixed(2)}` : '₹0.00'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm">
                          {item.changed_by_name}{' '}
                          <span className="text-muted text-xs">({item.changed_by_employee_id})</span>
                        </span>
                      </td>
                      <td>
                        <span className="text-muted text-sm">{item.note || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && history.length > 0 && (
          <div className="pagination-bar">
            <span className="text-muted text-sm">
              Showing {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} audit events
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchGlobalHistory(pagination.page - 1)}
              >
                <ChevronLeft size={14} aria-hidden="true" /> Previous
              </button>
              <span className="page-indicator text-sm">
                Page {pagination.page} of {pagination.pages || 1}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchGlobalHistory(pagination.page + 1)}
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
