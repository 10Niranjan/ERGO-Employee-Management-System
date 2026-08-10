import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getSalaryRates,
  updateSalaryRate,
  getEmployeeSalaryHistory,
} from '../api/salaryApi';
import {
  computeSalary,
  generatePayslip,
  listPayslips,
  downloadPayslipPDF,
} from '../api/reportApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './SalaryManagementPage.css';

export default function SalaryManagementPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('rates'); // 'rates' | 'compute'

  // Rates tab states
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals for Rates
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Form states
  const [newRate, setNewRate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History modal state
  const [empHistory, setEmpHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ─── Computation & Payslips Tab State ──────────────────────────────────────
  const now = new Date();
  const [calcYear, setCalcYear] = useState(now.getFullYear());
  const [calcMonth, setCalcMonth] = useState(now.getMonth() + 1);
  const [calcUserId, setCalcUserId] = useState('');
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [generatingPayslip, setGeneratingPayslip] = useState(false);

  // List of generated payslips for the period
  const [savedPayslips, setSavedPayslips] = useState([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSalaryRates({ search: search.trim() });
      setEmployees(data.employees || []);
      if (data.employees?.length > 0 && !calcUserId) {
        setCalcUserId(String(data.employees[0].id));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch salary rates');
    } finally {
      setLoading(false);
    }
  }, [search, calcUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRates();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchRates]);

  // Compute salary preview
  const handleComputeSalary = useCallback(async () => {
    if (!calcUserId) return;
    setCalcLoading(true);
    try {
      const data = await computeSalary({
        user_id: parseInt(calcUserId, 10),
        year: calcYear,
        month: calcMonth,
      });
      setCalcResult(data);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to compute salary', 'error');
    } finally {
      setCalcLoading(false);
    }
  }, [calcUserId, calcYear, calcMonth, showToast]);

  // Fetch saved payslips for current filter
  const fetchSavedPayslips = useCallback(async () => {
    setPayslipsLoading(true);
    try {
      const data = await listPayslips({
        year: calcYear,
        month: calcMonth,
      });
      setSavedPayslips(data.payslips || []);
    } catch (err) {
      console.error('Failed to load payslips list', err);
    } finally {
      setPayslipsLoading(false);
    }
  }, [calcYear, calcMonth]);

  useEffect(() => {
    if (activeTab === 'compute' && calcUserId) {
      handleComputeSalary();
      fetchSavedPayslips();
    }
  }, [activeTab, calcUserId, calcYear, calcMonth, handleComputeSalary, fetchSavedPayslips]);

  function handleOpenUpdate(emp) {
    setSelectedEmployee(emp);
    setNewRate(emp.per_day_salary || '');
    setNote('');
    setIsUpdateModalOpen(true);
  }

  async function handleOpenHistory(emp) {
    setSelectedEmployee(emp);
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await getEmployeeSalaryHistory(emp.id);
      setEmpHistory(data.history || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load salary history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleUpdateSubmit(e) {
    e.preventDefault();
    const rateVal = parseFloat(newRate);
    if (isNaN(rateVal) || rateVal < 0) {
      showToast('Please enter a valid positive salary rate', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateSalaryRate(selectedEmployee.id, {
        per_day_salary: rateVal,
        note: note.trim() || undefined,
      });
      showToast('Salary rate updated and recorded in audit log!', 'success');
      setIsUpdateModalOpen(false);
      fetchRates();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update salary rate', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // Generate Payslip Snapshot
  async function handleGeneratePayslip() {
    if (!calcUserId) return;
    setGeneratingPayslip(true);
    try {
      const res = await generatePayslip({
        user_id: parseInt(calcUserId, 10),
        year: calcYear,
        month: calcMonth,
      });
      showToast('Official payslip snapshot generated & saved!', 'success');
      fetchSavedPayslips();
      // Download right away
      if (res.payslip?.id) {
        const empName = calcResult?.employee?.employee_id || 'employee';
        await downloadPayslipPDF(res.payslip.id, `Payslip_${empName}_${calcMonth}_${calcYear}.pdf`);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to generate payslip', 'error');
    } finally {
      setGeneratingPayslip(false);
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Per-Day Salary & Payroll</h1>
          <p className="page-subtitle text-muted">
            Configure employee daily rates, preview deterministic monthly compensation, and generate official payslip snapshots.
          </p>
        </div>
        <div className="action-buttons-group">
          <Link to="/admin/salary-history" className="btn btn-ghost">
            <span>📜</span> View Global Audit Log
          </Link>
          <Link to="/admin/reports" className="btn btn-primary">
            <span>📊</span> Consolidated Reports
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="employee-section-tabs" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className={`emp-tab-btn ${activeTab === 'rates' ? 'active' : ''}`}
          onClick={() => setActiveTab('rates')}
        >
          💰 Employee Base Rates
        </button>
        <button
          type="button"
          className={`emp-tab-btn ${activeTab === 'compute' ? 'active' : ''}`}
          onClick={() => setActiveTab('compute')}
        >
          🧮 Monthly Calculation & Payslips
        </button>
      </div>

      {activeTab === 'rates' ? (
        <>
          {/* Policy Notice */}
          <div className="policy-banner card">
            <span className="policy-icon">💰</span>
            <div className="policy-text">
              <strong>Per-Day Rate Architecture:</strong> In V1, monthly gross salary is computed strictly from actual attendance and approved leave records: <code>(Per-Day Rate × Days Present) + (Half-Day Rate × Half-Days) + (Per-Day Rate × Paid Leaves)</code>. Weekends and holidays are non-working and excluded.
            </div>
          </div>

          {/* Controls */}
          <div className="page-controls card">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by employee name, ID, or designation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')}>
                  ×
                </button>
              )}
            </div>
            <span className="text-muted text-sm">
              Total Employees: <strong>{employees.length}</strong>
            </span>
          </div>

          {/* Main Table */}
          <div className="table-card card">
            {loading ? (
              <div className="state-container">
                <span className="spinner" />
                <p className="text-muted">Loading employee salary rates...</p>
              </div>
            ) : error ? (
              <div className="state-container">
                <span className="state-icon text-danger">⚠️</span>
                <p className="text-danger">{error}</p>
                <button className="btn btn-ghost btn-sm" onClick={fetchRates}>
                  Try Again
                </button>
              </div>
            ) : employees.length === 0 ? (
              <div className="state-container">
                <span className="state-icon">👥</span>
                <h3>No employees found</h3>
                <p className="text-muted text-sm">
                  {search ? 'No matches for your search term.' : 'Onboard employees first in Employee Directory.'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Designation</th>
                      <th>Current Per-Day Rate</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className={emp.status === 'inactive' ? 'row-inactive' : ''}>
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
                          <strong className="salary-rate-highlight">
                            ₹{parseFloat(emp.per_day_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </strong>
                          <span className="text-muted text-xs"> / day</span>
                        </td>
                        <td>
                          <span className={`status-pill ${emp.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                            {emp.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <span className="text-muted text-sm">
                            {new Date(emp.updated_at).toLocaleDateString('en-IN')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-buttons-group">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleOpenUpdate(emp)}
                            >
                              ✏️ Update Rate
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="View Revision History"
                              onClick={() => handleOpenHistory(emp)}
                            >
                              📜 History
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
        /* ─── Computation & Payslips Section ────────────────────────────── */
        <div className="salary-compute-section">
          <div className="page-controls card" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div className="filter-group">
              <label className="filter-label" htmlFor="calc-emp-select">
                Select Employee:
              </label>
              <select
                id="calc-emp-select"
                className="filter-select"
                value={calcUserId}
                onChange={(e) => setCalcUserId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employee_id}) — ₹{parseFloat(e.per_day_salary).toFixed(0)}/day
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="calc-month-select">
                Month:
              </label>
              <select
                id="calc-month-select"
                className="filter-select"
                value={calcMonth}
                onChange={(e) => setCalcMonth(parseInt(e.target.value, 10))}
              >
                {monthNames.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="calc-year-select">
                Year:
              </label>
              <input
                id="calc-year-select"
                type="number"
                min="2020"
                max="2030"
                style={{ width: '90px' }}
                value={calcYear}
                onChange={(e) => setCalcYear(parseInt(e.target.value, 10))}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={calcLoading || !calcUserId}
              onClick={handleComputeSalary}
            >
              {calcLoading ? <span className="spinner" /> : '🔄 Preview Calculation'}
            </button>

            <button
              type="button"
              className="btn btn-success"
              disabled={generatingPayslip || !calcResult}
              onClick={handleGeneratePayslip}
            >
              {generatingPayslip ? <span className="spinner" /> : '📄 Generate & Download Payslip (PDF)'}
            </button>
          </div>

          {/* Salary Summary Cards */}
          {calcResult?.summary && (
            <div className="attendance-kpi-grid" style={{ marginTop: 'var(--space-4)' }}>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">Working Days</span>
                <div className="kpi-value">{calcResult.summary.working_days}</div>
                <span className="kpi-sub text-muted text-xs">Total in {monthNames[calcMonth - 1]}</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">Present Days</span>
                <div className="kpi-value text-success">{calcResult.summary.present_days}</div>
                <span className="kpi-sub text-muted text-xs">100% per-day rate</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">Half-Days</span>
                <div className="kpi-value text-warning">{calcResult.summary.half_days}</div>
                <span className="kpi-sub text-muted text-xs">50% per-day rate</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">On Duty / Travel</span>
                <div className="kpi-value" style={{ color: 'var(--color-primary)' }}>{calcResult.summary.travel_days}</div>
                <span className="kpi-sub text-muted text-xs">100% per-day rate</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">Paid Leaves</span>
                <div className="kpi-value text-success">{calcResult.summary.paid_leave_days}</div>
                <span className="kpi-sub text-muted text-xs">100% compensation</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-title text-muted text-xs">Absent / Unpaid</span>
                <div className="kpi-value text-danger">
                  {calcResult.summary.absent_days + calcResult.summary.unpaid_leave_days}
                </div>
                <span className="kpi-sub text-muted text-xs">0% compensation</span>
              </div>
              <div className="kpi-card card" style={{ gridColumn: 'span 2', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-focus)' }}>
                <span className="kpi-title text-muted text-xs">NET PAYABLE SALARY</span>
                <div className="kpi-value text-success" style={{ fontSize: 'var(--font-size-2xl)' }}>
                  ₹{parseFloat(calcResult.summary.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="kpi-sub text-muted text-xs">
                  Deterministic rate calculation for {calcResult.employee.name}
                </span>
              </div>
            </div>
          )}

          {/* Day by Day Itemized Calculation Breakdown Table */}
          {calcResult?.days && (
            <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
              <div className="card-header-bar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)' }}>
                  Day-by-Day Salary Calculation Audit Log ({monthNames[calcMonth - 1]} {calcYear})
                </h3>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status Evaluated</th>
                      <th>Applicable Rate (₹)</th>
                      <th>Factor</th>
                      <th>Daily Payable Amount (₹)</th>
                      <th>Calculation Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcResult.days.map((d) => (
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
                        <td>
                          <span>₹{parseFloat(d.rate).toFixed(2)}</span>
                        </td>
                        <td>
                          <strong>{d.payable_factor * 100}%</strong>
                        </td>
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

          {/* Saved Generated Payslips for this month */}
          <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
            <div className="card-header-bar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
              <h3 className="section-title" style={{ fontSize: 'var(--font-size-md)' }}>
                Official Generated Payslips ({monthNames[calcMonth - 1]} {calcYear})
              </h3>
            </div>

            {payslipsLoading ? (
              <div className="state-container">
                <span className="spinner" />
                <p className="text-muted">Loading payslips...</p>
              </div>
            ) : savedPayslips.length === 0 ? (
              <div className="state-container">
                <span className="state-icon">📄</span>
                <h3>No payslips generated for this period</h3>
                <p className="text-muted text-sm">
                  Click "Generate & Download Payslip (PDF)" above to generate an official snapshot.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Working Days</th>
                      <th>Present / Travel</th>
                      <th>Paid Leaves</th>
                      <th>Net Salary</th>
                      <th>Generated Timestamp</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedPayslips.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="emp-name-col">
                            <strong className="emp-fullname">{p.employee_name}</strong>
                            <span className="emp-id-badge" style={{ width: 'fit-content' }}>
                              {p.employee_id}
                            </span>
                          </div>
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
                            {new Date(p.generated_at).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              downloadPayslipPDF(p.id, `Payslip_${p.employee_id}_${monthNames[calcMonth - 1]}_${calcYear}.pdf`)
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

      {/* Modal: Update Salary Rate */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => !submitting && setIsUpdateModalOpen(false)}
        title={`Update Salary Rate (${selectedEmployee?.employee_id})`}
      >
        <form onSubmit={handleUpdateSubmit} className="modal-form">
          <div className="profile-hero-badge" style={{ paddingBottom: 'var(--space-2)' }}>
            <div>
              <h3>{selectedEmployee?.name}</h3>
              <span className="text-muted text-sm">{selectedEmployee?.designation || 'No Designation'}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Current Per-Day Rate</label>
            <input
              type="text"
              disabled
              value={`₹${parseFloat(selectedEmployee?.per_day_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="new-rate-input">
              New Per-Day Rate (₹) *
            </label>
            <input
              id="new-rate-input"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="e.g. 2000"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="salary-note-input">
              Audit Reason / Note (Optional)
            </label>
            <input
              id="salary-note-input"
              type="text"
              placeholder="e.g. Annual appraisal, Promotion to Senior Dev"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsUpdateModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Saving Revision...' : 'Save & Log Revision'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Employee Revision History */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`Salary Revision Log: ${selectedEmployee?.name}`}
        maxWidth="680px"
      >
        {historyLoading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading revision records...</p>
          </div>
        ) : empHistory.length === 0 ? (
          <div className="state-container">
            <span className="state-icon">📜</span>
            <p className="text-muted">No rate revisions recorded yet for this employee.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Previous Rate</th>
                  <th>New Rate</th>
                  <th>Changed By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {empHistory.map((rev) => (
                  <tr key={rev.id}>
                    <td>
                      <span className="text-sm">
                        {new Date(rev.changed_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <span className="text-muted text-sm">
                        ₹{parseFloat(rev.old_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      <strong className="salary-rate-text">
                        ₹{parseFloat(rev.new_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      <span className="text-sm">{rev.changed_by_name}</span>
                    </td>
                    <td>
                      <span className="text-muted text-sm">{rev.note || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => setIsHistoryModalOpen(false)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
