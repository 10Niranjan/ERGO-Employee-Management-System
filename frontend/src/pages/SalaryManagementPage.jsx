import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calculator,
  Download,
  FileBarChart2,
  FileDown,
  FileText,
  History,
  Pencil,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
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

  // Form states for salary update
  const [salaryForm, setSalaryForm] = useState({
    monthly_salary: '',
    note: '',
    basic: '', hra: '', education_allowance: '', conveyance: '',
    professional_development: '', other_allowance: '', lta: '',
    employer_pf: '', bonus: '',
    pf_deduction: '', professional_tax: '', tds: '', pan: '',
  });
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
    setSalaryForm({
      monthly_salary:           emp.monthly_salary           || '',
      note:                     '',
      basic:                    emp.basic                    || '',
      hra:                      emp.hra                      || '',
      education_allowance:      emp.education_allowance      || '',
      conveyance:               emp.conveyance               || '',
      professional_development: emp.professional_development || '',
      other_allowance:          emp.other_allowance          || '',
      lta:                      emp.lta                      || '',
      employer_pf:              emp.employer_pf              || '',
      bonus:                    emp.bonus                    || '',
      pf_deduction:             emp.pf_deduction             || '',
      professional_tax:         emp.professional_tax         || '',
      tds:                      emp.tds                      || '',
      pan:                      emp.pan                      || '',
    });
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
    const rateVal = parseFloat(salaryForm.monthly_salary);
    if (isNaN(rateVal) || rateVal < 0) {
      showToast('Please enter a valid positive monthly salary', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateSalaryRate(selectedEmployee.id, {
        monthly_salary:           rateVal,
        note:                     salaryForm.note.trim() || undefined,
        basic:                    salaryForm.basic                    !== '' ? parseFloat(salaryForm.basic)                    : undefined,
        hra:                      salaryForm.hra                      !== '' ? parseFloat(salaryForm.hra)                      : undefined,
        education_allowance:      salaryForm.education_allowance      !== '' ? parseFloat(salaryForm.education_allowance)      : undefined,
        conveyance:               salaryForm.conveyance               !== '' ? parseFloat(salaryForm.conveyance)               : undefined,
        professional_development: salaryForm.professional_development !== '' ? parseFloat(salaryForm.professional_development) : undefined,
        other_allowance:          salaryForm.other_allowance          !== '' ? parseFloat(salaryForm.other_allowance)          : undefined,
        lta:                      salaryForm.lta                      !== '' ? parseFloat(salaryForm.lta)                      : undefined,
        employer_pf:              salaryForm.employer_pf              !== '' ? parseFloat(salaryForm.employer_pf)              : undefined,
        bonus:                    salaryForm.bonus                    !== '' ? parseFloat(salaryForm.bonus)                    : undefined,
        pf_deduction:             salaryForm.pf_deduction             !== '' ? parseFloat(salaryForm.pf_deduction)             : undefined,
        professional_tax:         salaryForm.professional_tax         !== '' ? parseFloat(salaryForm.professional_tax)         : undefined,
        tds:                      salaryForm.tds                      !== '' ? parseFloat(salaryForm.tds)                      : undefined,
        pan:                      salaryForm.pan?.trim().toUpperCase() || undefined,
      });
      showToast('Monthly salary updated and recorded in audit log!', 'success');
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
          <h1 className="page-title">Monthly Salary & Payroll</h1>
          <p className="page-subtitle text-muted">
            Set each employee's monthly salary, preview deterministic compensation, and generate official payslip snapshots.
          </p>
        </div>
        <div className="action-buttons-group">
          <Link to="/admin/salary-history" className="btn btn-ghost">
            <History size={15} aria-hidden="true" /> View Global Audit Log
          </Link>
          <Link to="/admin/reports" className="btn btn-primary">
            <FileBarChart2 size={15} aria-hidden="true" /> Consolidated Reports
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
          <Wallet size={15} aria-hidden="true" /> Employee Salaries
        </button>
        <button
          type="button"
          className={`emp-tab-btn ${activeTab === 'compute' ? 'active' : ''}`}
          onClick={() => setActiveTab('compute')}
        >
          <Calculator size={15} aria-hidden="true" /> Monthly Calculation & Payslips
        </button>
      </div>

      {activeTab === 'rates' ? (
        <>
          {/* Policy Notice */}
          <div className="policy-banner card">
            <Wallet className="policy-icon" size={20} aria-hidden="true" />
            <div className="policy-text">
              <strong>Calendar-Days Salary Model:</strong> Each employee has one monthly salary figure. The per-day rate is derived from it each month — <code>Monthly Salary ÷ Days in That Month</code> — so it floats slightly with month length. Weekends, holidays, present, travel, and paid-leave days are all paid at the full derived rate; half-days pay 50%; unpaid leave and unmarked/absent working days pay 0%.
            </div>
          </div>

          {/* Controls */}
          <div className="page-controls card">
            <div className="search-box">
              <Search className="search-icon" size={14} aria-hidden="true" />
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
                <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
                <p className="text-danger">{error}</p>
                <button className="btn btn-ghost btn-sm" onClick={fetchRates}>
                  Try Again
                </button>
              </div>
            ) : employees.length === 0 ? (
              <div className="state-container">
                <Users className="state-icon" size={40} aria-hidden="true" />
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
                      <th>Monthly Salary</th>
                      <th>Derived Rate (this month)</th>
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
                            ₹{parseFloat(emp.monthly_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </strong>
                          <span className="text-muted text-xs"> / mo</span>
                        </td>
                        <td>
                          <span className="text-muted">
                            ₹{parseFloat(emp.derived_per_day_rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
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
                              <Pencil size={13} aria-hidden="true" /> Update Rate
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="View Revision History"
                              onClick={() => handleOpenHistory(emp)}
                            >
                              <History size={13} aria-hidden="true" /> History
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
                    {e.name} ({e.employee_id}) — ₹{parseFloat(e.monthly_salary).toFixed(0)}/mo
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
              {calcLoading ? (
                <span className="spinner" />
              ) : (
                <>
                  <RefreshCw size={14} aria-hidden="true" /> Preview Calculation
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-success"
              disabled={generatingPayslip || !calcResult}
              onClick={handleGeneratePayslip}
            >
              {generatingPayslip ? (
                <span className="spinner" />
              ) : (
                <>
                  <FileDown size={14} aria-hidden="true" /> Generate & Download Payslip (PDF)
                </>
              )}
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
                  ₹{parseFloat(calcResult.employee.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/mo
                  {' '}(₹{parseFloat(calcResult.summary.per_day_salary).toFixed(2)}/day this month)
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
                <FileText className="state-icon" size={40} aria-hidden="true" />
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
                            <Download size={13} aria-hidden="true" /> Download PDF
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
        maxWidth="660px"
      >
        <form onSubmit={handleUpdateSubmit} className="modal-form">
          <div className="profile-hero-badge" style={{ paddingBottom: 'var(--space-2)' }}>
            <div>
              <h3>{selectedEmployee?.name}</h3>
              <span className="text-muted text-sm">{selectedEmployee?.designation || 'No Designation'}</span>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="new-rate-input">Monthly Salary (₹) *</label>
              <input id="new-rate-input" type="number" min="0" step="0.01" required
                placeholder="e.g. 50000"
                value={salaryForm.monthly_salary}
                onChange={(e) => setSalaryForm({ ...salaryForm, monthly_salary: e.target.value })}
                disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="salary-pan-input">PAN Number</label>
              <input id="salary-pan-input" type="text" placeholder="e.g. ABCDE1234F" maxLength={10}
                value={salaryForm.pan}
                onChange={(e) => setSalaryForm({ ...salaryForm, pan: e.target.value.toUpperCase() })}
                disabled={submitting} />
            </div>
          </div>

          <p className="salary-section-heading">Earnings</p>
          <div className="form-grid-2">
            {[['sr-basic','Basic Pay (₹)','basic'],['sr-hra','HRA (₹)','hra'],
              ['sr-edu','Education Allowance (₹)','education_allowance'],['sr-conv','Conveyance (₹)','conveyance'],
              ['sr-pd','Professional Development (₹)','professional_development'],['sr-oa','Other Allowance (₹)','other_allowance'],
              ['sr-lta','LTA (₹)','lta'],['sr-epf','Employer PF (₹)','employer_pf'],
              ['sr-bonus','Bonus (₹)','bonus']].map(([id, label, key]) => (
              <div className="form-group" key={key}>
                <label className="form-label" htmlFor={id}>{label}</label>
                <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                  value={salaryForm[key]}
                  onChange={(e) => setSalaryForm({ ...salaryForm, [key]: e.target.value })}
                  disabled={submitting} />
              </div>
            ))}
          </div>

          <p className="salary-section-heading">Deductions</p>
          <div className="form-grid-2">
            {[['sr-pfd','PF Deduction (₹)','pf_deduction'],['sr-pt','Professional Tax (₹)','professional_tax'],
              ['sr-tds','TDS (₹)','tds']].map(([id, label, key]) => (
              <div className="form-group" key={key}>
                <label className="form-label" htmlFor={id}>{label}</label>
                <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                  value={salaryForm[key]}
                  onChange={(e) => setSalaryForm({ ...salaryForm, [key]: e.target.value })}
                  disabled={submitting} />
              </div>
            ))}
          </div>

          {/* Live summary */}
          {(() => {
            const f = salaryForm;
            const gross = [f.basic, f.hra, f.education_allowance, f.conveyance,
              f.professional_development, f.other_allowance, f.lta, f.employer_pf, f.bonus]
              .reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const deductions = [f.pf_deduction, f.professional_tax, f.tds]
              .reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const net = gross - deductions;
            const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
            return (
              <div className="salary-summary-strip">
                <div className="salary-summary-item">
                  <span className="salary-summary-label">Gross Income</span>
                  <strong className="salary-summary-value">₹{fmt(gross)}</strong>
                </div>
                <div className="salary-summary-item">
                  <span className="salary-summary-label">Total Deduction</span>
                  <strong className="salary-summary-value text-danger">₹{fmt(deductions)}</strong>
                </div>
                <div className="salary-summary-item">
                  <span className="salary-summary-label">Net Salary</span>
                  <strong className="salary-summary-value salary-rate-text">₹{fmt(net)}</strong>
                </div>
              </div>
            );
          })()}

          <div className="form-group">
            <label className="form-label" htmlFor="salary-note-input">Audit Reason / Note (Optional)</label>
            <input id="salary-note-input" type="text"
              placeholder="e.g. Annual appraisal, Promotion to Senior Dev"
              value={salaryForm.note}
              onChange={(e) => setSalaryForm({ ...salaryForm, note: e.target.value })}
              disabled={submitting} />
          </div>

          <div className="modal-actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setIsUpdateModalOpen(false)} disabled={submitting}>
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
            <History className="state-icon" size={40} aria-hidden="true" />
            <p className="text-muted">No rate revisions recorded yet for this employee.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Previous Salary</th>
                  <th>New Salary</th>
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
                        ₹{parseFloat(rev.old_monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      <strong className="salary-rate-text">
                        ₹{parseFloat(rev.new_monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
