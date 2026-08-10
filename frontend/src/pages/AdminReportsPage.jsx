import { useState, useEffect, useCallback } from 'react';
import { getSalaryRates } from '../api/salaryApi';
import { computeSalary, downloadConsolidatedExcel } from '../api/reportApi';
import { useToast } from '../components/Toast';
import './AdminReportsPage.css';

export default function AdminReportsPage() {
  const { showToast } = useToast();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [reportRows, setReportRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [search, setSearch] = useState('');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const fetchConsolidatedReport = useCallback(async () => {
    setLoading(true);
    try {
      const ratesData = await getSalaryRates();
      const activeEmps = (ratesData.employees || []).filter((e) => e.status === 'active');

      const rows = [];
      for (const emp of activeEmps) {
        try {
          const calc = await computeSalary({
            user_id: emp.id,
            year: selectedYear,
            month: selectedMonth,
          });
          rows.push(calc);
        } catch (err) {
          console.error(`Failed to calculate for ${emp.name}`, err);
        }
      }
      setReportRows(rows);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to generate payroll report', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, showToast]);

  useEffect(() => {
    fetchConsolidatedReport();
  }, [fetchConsolidatedReport]);

  async function handleDownloadExcel() {
    setDownloadingExcel(true);
    try {
      const monthName = monthNames[selectedMonth - 1];
      await downloadConsolidatedExcel(
        { year: selectedYear, month: selectedMonth },
        `Consolidated_Payroll_${monthName}_${selectedYear}.xlsx`
      );
      showToast('Consolidated payroll report downloaded successfully!', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to export Excel report', 'error');
    } finally {
      setDownloadingExcel(false);
    }
  }

  const filteredRows = reportRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.employee.name.toLowerCase().includes(q) ||
      r.employee.employee_id.toLowerCase().includes(q) ||
      r.employee.designation?.toLowerCase().includes(q)
    );
  });

  const totalPayroll = filteredRows.reduce(
    (sum, r) => sum + (parseFloat(r.summary.net_salary) || 0),
    0
  );

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Monthly Payroll & Reports Centre</h1>
          <p className="page-subtitle text-muted">
            Consolidated company-wide payroll calculations, attendance breakdown, and downloadable Excel sheets.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={downloadingExcel || loading}
          onClick={handleDownloadExcel}
        >
          {downloadingExcel ? <span className="spinner" /> : '📊'}
          {downloadingExcel ? 'Generating Excel...' : 'Export Consolidated Excel (.xlsx)'}
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="page-controls card">
        <div className="filter-group">
          <label className="filter-label" htmlFor="report-month-select">
            Payroll Month:
          </label>
          <select
            id="report-month-select"
            className="filter-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="report-year-select">
            Year:
          </label>
          <input
            id="report-year-select"
            type="number"
            min="2020"
            max="2030"
            style={{ width: '90px' }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="search-box" style={{ marginLeft: 'auto' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="attendance-kpi-grid" style={{ marginTop: 'var(--space-4)' }}>
        <div className="kpi-card card">
          <span className="kpi-title text-muted text-xs">Total Active Staff</span>
          <div className="kpi-value">{reportRows.length}</div>
          <span className="kpi-sub text-muted text-xs">Evaluated this month</span>
        </div>
        <div className="kpi-card card" style={{ gridColumn: 'span 2', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-focus)' }}>
          <span className="kpi-title text-muted text-xs">GRAND TOTAL PAYROLL (INR)</span>
          <div className="kpi-value text-success" style={{ fontSize: 'var(--font-size-2xl)' }}>
            ₹{totalPayroll.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="kpi-sub text-muted text-xs">
            Sum of net payable salary for {monthNames[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="table-card card" style={{ marginTop: 'var(--space-6)' }}>
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Calculating consolidated payroll report...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="state-container">
            <span className="state-icon">📊</span>
            <h3>No records found</h3>
            <p className="text-muted text-sm">No active employees found for this period.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Base Rate</th>
                  <th>Working Days</th>
                  <th>Present</th>
                  <th>Half-Day</th>
                  <th>Travel</th>
                  <th>Paid Leave</th>
                  <th>Unpaid Leave</th>
                  <th>Absent</th>
                  <th>Holidays/Weekends</th>
                  <th style={{ textAlign: 'right' }}>Net Payable (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.employee.id}>
                    <td>
                      <div className="emp-name-col">
                        <strong className="emp-fullname">{r.employee.name}</strong>
                        <span className="emp-id-badge" style={{ width: 'fit-content' }}>
                          {r.employee.employee_id}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="emp-designation">{r.employee.designation || '—'}</span>
                    </td>
                    <td>
                      <span>₹{parseFloat(r.summary.per_day_salary).toFixed(2)}</span>
                    </td>
                    <td>{r.summary.working_days}</td>
                    <td>
                      <strong className="text-success">{r.summary.present_days}</strong>
                    </td>
                    <td>
                      <span className="text-warning">{r.summary.half_days}</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-primary)' }}>{r.summary.travel_days}</span>
                    </td>
                    <td>
                      <span className="text-success">{r.summary.paid_leave_days}</span>
                    </td>
                    <td>
                      <span className="text-muted">{r.summary.unpaid_leave_days}</span>
                    </td>
                    <td>
                      <span className="text-danger">{r.summary.absent_days}</span>
                    </td>
                    <td>{r.summary.holiday_count + r.summary.weekend_count}</td>
                    <td style={{ textAlign: 'right' }}>
                      <strong className="salary-rate-highlight" style={{ fontSize: 'var(--font-size-md)' }}>
                        ₹{parseFloat(r.summary.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
