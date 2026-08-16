import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Info,
  Lock,
  Pencil,
  Plus,
  Search,
  Unlock,
  Users,
} from 'lucide-react';
import { getUsers, createUser, updateUser, updateStatus } from '../api/userApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './EmployeesPage.css';

// Initial salary component state shared between Add and Edit
const SALARY_COMPONENT_DEFAULTS = {
  monthly_salary: '',
  basic: '',
  hra: '',
  education_allowance: '',
  conveyance: '',
  professional_development: '',
  other_allowance: '',
  lta: '',
  employer_pf: '',
  bonus: '',
  pf_deduction: '',
  professional_tax: '',
  tds: '',
  pan: '',
};

export default function EmployeesPage() {
  const { showToast } = useToast();

  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [tempCredentialsModal, setTempCredentialsModal] = useState(null);

  // Step wizard for Add modal
  const [addStep, setAddStep] = useState(1);

  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;

      const data = await getUsers(params);
      setEmployees(data.users || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 10, pages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchEmployees]);

  // Form state — covers both Add (step 1+2) and Edit modals
  const [formData, setFormData] = useState({
    // Step 1 — Personal
    name: '',
    email: '',
    phone: '',
    designation: '',
    date_of_joining: '',
    gender: '',
    date_of_birth: '',
    address: '',
    bank_name: '',
    bank_account_no: '',
    ifsc_code: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    // Step 2 — Salary
    ...SALARY_COMPONENT_DEFAULTS,
  });

  function handleOpenAddModal() {
    setFormData({
      // Step 1
      name: '',
      email: '',
      phone: '',
      designation: '',
      date_of_joining: new Date().toISOString().slice(0, 10),
      gender: '',
      date_of_birth: '',
      address: '',
      bank_name: '',
      bank_account_no: '',
      ifsc_code: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      // Step 2
      ...SALARY_COMPONENT_DEFAULTS,
    });
    setAddStep(1);
    setIsAddModalOpen(true);
  }

  function handleOpenEditModal(emp) {
    setSelectedEmployee(emp);
    setFormData({
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      designation: emp.designation || '',
      date_of_joining: emp.date_of_joining ? emp.date_of_joining.slice(0, 10) : '',
      gender: emp.gender || '',
      date_of_birth: emp.date_of_birth ? emp.date_of_birth.slice(0, 10) : '',
      address: emp.address || '',
      bank_name: emp.bank_name || '',
      bank_account_no: emp.bank_account_no || '',
      ifsc_code: emp.ifsc_code || '',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      // Salary components
      monthly_salary: emp.monthly_salary || '',
      basic: emp.basic || '',
      hra: emp.hra || '',
      education_allowance: emp.education_allowance || '',
      conveyance: emp.conveyance || '',
      professional_development: emp.professional_development || '',
      other_allowance: emp.other_allowance || '',
      lta: emp.lta || '',
      employer_pf: emp.employer_pf || '',
      bonus: emp.bonus || '',
      pf_deduction: emp.pf_deduction || '',
      professional_tax: emp.professional_tax || '',
      tds: emp.tds || '',
      pan: emp.pan || '',
    });
    setIsEditModalOpen(true);
  }

  function handleOpenViewModal(emp) {
    setSelectedEmployee(emp);
    setIsViewModalOpen(true);
  }

  function handleOpenConfirmModal(emp) {
    setSelectedEmployee(emp);
    setIsConfirmModalOpen(true);
  }

  // Step 1 → Step 2 navigation
  function handleNextStep() {
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast('Full Name and Email Address are required', 'error');
      return;
    }
    setAddStep(2);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    const salary = parseFloat(formData.monthly_salary);
    if (isNaN(salary) || salary < 0) {
      showToast('Monthly Salary is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createUser({
        ...formData,
        monthly_salary: salary,
        basic:                    parseFloat(formData.basic)                    || 0,
        hra:                      parseFloat(formData.hra)                      || 0,
        education_allowance:      parseFloat(formData.education_allowance)      || 0,
        conveyance:               parseFloat(formData.conveyance)               || 0,
        professional_development: parseFloat(formData.professional_development) || 0,
        other_allowance:          parseFloat(formData.other_allowance)          || 0,
        lta:                      parseFloat(formData.lta)                      || 0,
        employer_pf:              parseFloat(formData.employer_pf)              || 0,
        bonus:                    parseFloat(formData.bonus)                    || 0,
        pf_deduction:             parseFloat(formData.pf_deduction)             || 0,
        professional_tax:         parseFloat(formData.professional_tax)         || 0,
        tds:                      parseFloat(formData.tds)                      || 0,
        pan:                      formData.pan?.trim().toUpperCase() || undefined,
      });
      showToast('Employee created successfully!', 'success');
      setIsAddModalOpen(false);
      setAddStep(1);
      setTempCredentialsModal({
        user: res.user,
        temp_password: res.temp_password,
      });
      fetchEmployees(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create employee', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast('Name and Email are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateUser(selectedEmployee.id, {
        ...formData,
        monthly_salary:           formData.monthly_salary           ? parseFloat(formData.monthly_salary)           : 0,
        basic:                    formData.basic                    !== '' ? parseFloat(formData.basic)                    : undefined,
        hra:                      formData.hra                      !== '' ? parseFloat(formData.hra)                      : undefined,
        education_allowance:      formData.education_allowance      !== '' ? parseFloat(formData.education_allowance)      : undefined,
        conveyance:               formData.conveyance               !== '' ? parseFloat(formData.conveyance)               : undefined,
        professional_development: formData.professional_development !== '' ? parseFloat(formData.professional_development) : undefined,
        other_allowance:          formData.other_allowance          !== '' ? parseFloat(formData.other_allowance)          : undefined,
        lta:                      formData.lta                      !== '' ? parseFloat(formData.lta)                      : undefined,
        employer_pf:              formData.employer_pf              !== '' ? parseFloat(formData.employer_pf)              : undefined,
        bonus:                    formData.bonus                    !== '' ? parseFloat(formData.bonus)                    : undefined,
        pf_deduction:             formData.pf_deduction             !== '' ? parseFloat(formData.pf_deduction)             : undefined,
        professional_tax:         formData.professional_tax         !== '' ? parseFloat(formData.professional_tax)         : undefined,
        tds:                      formData.tds                      !== '' ? parseFloat(formData.tds)                      : undefined,
        pan:                      formData.pan?.trim().toUpperCase() || undefined,
      });
      showToast('Employee details updated!', 'success');
      setIsEditModalOpen(false);
      fetchEmployees(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update employee', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus() {
    if (!selectedEmployee) return;
    const newStatus = selectedEmployee.status === 'active' ? 'inactive' : 'active';
    setSubmitting(true);
    try {
      await updateStatus(selectedEmployee.id, newStatus);
      showToast(
        `Employee ${newStatus === 'active' ? 'reactivated' : 'deactivated'} successfully!`,
        'success'
      );
      setIsConfirmModalOpen(false);
      fetchEmployees(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to change employee status', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`, 'info');
  }

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Employee Directory</h1>
          <p className="page-subtitle text-muted">
            Manage your workforce accounts, contact information, and initial quotas.
          </p>
        </div>
        <button
          type="button"
          id="add-employee-btn"
          className="btn btn-primary"
          onClick={handleOpenAddModal}
        >
          <Plus size={15} aria-hidden="true" /> Onboard New Employee
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="page-controls card">
        <div className="search-box">
          <Search className="search-icon" size={14} aria-hidden="true" />
          <input
            type="text"
            id="employee-search-input"
            placeholder="Search by name, ID, email, or designation..."
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
          <label htmlFor="status-filter" className="filter-label">
            Status:
          </label>
          <select
            id="status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Employees</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading employee records...</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => fetchEmployees(pagination.page)}>
              Try Again
            </button>
          </div>
        ) : employees.length === 0 ? (
          <div className="state-container">
            <Users className="state-icon" size={40} aria-hidden="true" />
            <h3>No employees found</h3>
            <p className="text-muted text-sm">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search query or filter options.'
                : 'Get started by clicking "+ Onboard New Employee" above.'}
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
                  <th>Contact</th>
                  <th>Joining Date</th>
                  <th>Monthly Salary</th>
                  <th>Status</th>
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
                      <span className="emp-phone text-sm">{emp.phone || '—'}</span>
                    </td>
                    <td>
                      <span className="text-sm">
                        {emp.date_of_joining ? emp.date_of_joining.slice(0, 10) : '—'}
                      </span>
                    </td>
                    <td>
                      <strong className="salary-rate-text">
                        ₹{parseFloat(emp.monthly_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      <span className={`status-pill ${emp.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                        {emp.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="View Details"
                          onClick={() => handleOpenViewModal(emp)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Edit Details"
                          onClick={() => handleOpenEditModal(emp)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`action-icon-btn ${emp.status === 'active' ? 'action-deactivate' : 'action-reactivate'}`}
                          title={emp.status === 'active' ? 'Deactivate Employee' : 'Reactivate Employee'}
                          onClick={() => handleOpenConfirmModal(emp)}
                        >
                          {emp.status === 'active' ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && employees.length > 0 && (
          <div className="pagination-bar">
            <span className="text-muted text-sm">
              Showing {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} employees
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchEmployees(pagination.page - 1)}
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
                onClick={() => fetchEmployees(pagination.page + 1)}
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Employee — 2-step wizard */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => { if (!submitting) { setIsAddModalOpen(false); setAddStep(1); } }}
        title="Onboard New Employee"
        maxWidth={addStep === 2 ? '660px' : '540px'}
      >
        <form onSubmit={handleAddSubmit} className="modal-form">
          {/* Step indicator */}
          <div className="wizard-step-indicator">
            <div className={`wizard-step ${addStep === 1 ? 'wizard-step-active' : 'wizard-step-done'}`}>
              <div className="wizard-step-circle">1</div>
              <span className="wizard-step-label">Personal Details</span>
            </div>
            <div className="wizard-step-line" />
            <div className={`wizard-step ${addStep === 2 ? 'wizard-step-active' : ''}`}>
              <div className="wizard-step-circle">2</div>
              <span className="wizard-step-label">Salary &amp; Compensation</span>
            </div>
          </div>

          <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-2)' }}>
            {addStep === 1
              ? 'A unique Employee ID and temporary password will be automatically generated.'
              : 'Set the monthly salary and component-level breakdown for payroll.'}
          </p>

          {/* ── STEP 1: Personal Info ─────────────────────────────── */}
          {addStep === 1 && (
            <>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-name">Full Name *</label>
                  <input id="add-name" type="text" required placeholder="e.g. Rahul Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-email">Email Address *</label>
                  <input id="add-email" type="email" required placeholder="e.g. rahul@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={submitting} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-phone">Phone Number</label>
                  <input id="add-phone" type="tel" inputMode="numeric" placeholder="e.g. 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-designation">Designation</label>
                  <input id="add-designation" type="text" placeholder="e.g. Software Engineer"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    disabled={submitting} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-doj">Date of Joining</label>
                  <input id="add-doj" type="date" value={formData.date_of_joining}
                    onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-gender">Gender</label>
                  <select id="add-gender" value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    disabled={submitting}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-dob">Date of Birth</label>
                  <input id="add-dob" type="date" value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-address">Address</label>
                  <input id="add-address" type="text" placeholder="e.g. 12 MG Road, Pune"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={submitting} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-bank-name">Bank Name</label>
                  <input id="add-bank-name" type="text" placeholder="e.g. HDFC Bank"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-bank-account">Bank Account No.</label>
                  <input id="add-bank-account" type="text" inputMode="numeric" placeholder="e.g. 123456789012"
                    value={formData.bank_account_no}
                    onChange={(e) => setFormData({ ...formData, bank_account_no: e.target.value.replace(/[^0-9]/g, '') })}
                    disabled={submitting} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="add-ifsc">IFSC Code</label>
                  <input id="add-ifsc" type="text" placeholder="e.g. HDFC0001234"
                    value={formData.ifsc_code}
                    onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
                    disabled={submitting} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="add-emergency-name">Emergency Contact Name</label>
                  <input id="add-emergency-name" type="text" placeholder="e.g. Priya Sharma"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })}
                    disabled={submitting} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" htmlFor="add-emergency-phone">Emergency Contact Phone</label>
                  <input id="add-emergency-phone" type="tel" inputMode="numeric" placeholder="e.g. 9876543210"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value.replace(/[^0-9]/g, '') })}
                    disabled={submitting} />
                </div>
              </div>

              <div className="modal-actions-row">
                <button type="button" className="btn btn-ghost" onClick={() => setIsAddModalOpen(false)} disabled={submitting}>
                  Cancel
                </button>
                <button type="button" id="add-emp-next-btn" className="btn btn-primary" onClick={handleNextStep} disabled={submitting}>
                  Next <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: Salary & Compensation ──────────────────────── */}
          {addStep === 2 && (() => {
            const f = formData;
            const gross = [f.basic, f.hra, f.education_allowance, f.conveyance,
              f.professional_development, f.other_allowance, f.lta, f.employer_pf, f.bonus]
              .reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const deductions = [f.pf_deduction, f.professional_tax, f.tds]
              .reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const net = gross - deductions;
            const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
            return (
              <>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="add-monthly-salary">Monthly Salary (₹) *</label>
                    <input id="add-monthly-salary" type="number" min="0" step="0.01" placeholder="e.g. 54247"
                      value={formData.monthly_salary} required
                      onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                      disabled={submitting} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="add-pan">PAN Number</label>
                    <input id="add-pan" type="text" placeholder="e.g. ABCDE1234F" maxLength={10}
                      value={formData.pan}
                      onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                      disabled={submitting} />
                  </div>
                </div>

                <p className="salary-section-heading">Earnings Components</p>
                <div className="form-grid-2">
                  {[['add-basic','Basic Pay (₹)','basic'],['add-hra','HRA (₹)','hra'],
                    ['add-edu','Education Allowance (₹)','education_allowance'],['add-conv','Conveyance (₹)','conveyance'],
                    ['add-pd','Professional Development (₹)','professional_development'],['add-oa','Other Allowance (₹)','other_allowance'],
                    ['add-lta','LTA (₹)','lta'],['add-epf','Employer PF (₹)','employer_pf'],
                    ['add-bonus','Bonus (₹)','bonus']].map(([id, label, key]) => (
                    <div className="form-group" key={key}>
                      <label className="form-label" htmlFor={id}>{label}</label>
                      <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                        value={formData[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        disabled={submitting} />
                    </div>
                  ))}
                </div>

                <p className="salary-section-heading">Deductions</p>
                <div className="form-grid-2">
                  {[['add-pfd','PF Deduction (₹)','pf_deduction'],['add-pt','Professional Tax (₹)','professional_tax'],
                    ['add-tds','TDS (₹)','tds']].map(([id, label, key]) => (
                    <div className="form-group" key={key}>
                      <label className="form-label" htmlFor={id}>{label}</label>
                      <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                        value={formData[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        disabled={submitting} />
                    </div>
                  ))}
                </div>

                {/* Live computed summary */}
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

                <div className="modal-actions-row">
                  <button type="button" className="btn btn-ghost" onClick={() => setAddStep(1)} disabled={submitting}>
                    ← Back
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? <span className="spinner" /> : null}
                    {submitting ? 'Creating Employee...' : 'Create Employee'}
                  </button>
                </div>
              </>
            );
          })()}
        </form>
      </Modal>

      {/* Modal: Edit Employee */}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !submitting && setIsEditModalOpen(false)}
        title={`Edit Employee (${selectedEmployee?.employee_id})`}
        maxWidth="660px"
      >
        <form onSubmit={handleEditSubmit} className="modal-form">
          {/* ── Basic Info ── */}
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-name">Full Name *</label>
              <input id="edit-name" type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })}
                disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-email">Email Address *</label>
              <input id="edit-email" type="email" required value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={submitting} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-phone">Phone Number</label>
              <input id="edit-phone" type="tel" inputMode="numeric" value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-designation">Designation</label>
              <input id="edit-designation" type="text" value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                disabled={submitting} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-doj">Date of Joining</label>
              <input id="edit-doj" type="date" value={formData.date_of_joining}
                onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-gender">Gender</label>
              <select id="edit-gender" value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                disabled={submitting}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* ── Salary Components ── */}
          <p className="salary-section-heading" style={{ marginTop: 'var(--space-2)' }}>Salary &amp; Compensation</p>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-salary">Monthly Salary (₹)</label>
              <input id="edit-salary" type="number" min="0" step="0.01"
                value={formData.monthly_salary}
                onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-pan">PAN Number</label>
              <input id="edit-pan" type="text" placeholder="e.g. ABCDE1234F" maxLength={10}
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                disabled={submitting} />
            </div>
          </div>

          <p className="salary-section-heading">Earnings</p>
          <div className="form-grid-2">
            {[['edit-basic','Basic Pay (₹)','basic'],['edit-hra','HRA (₹)','hra'],
              ['edit-edu','Education Allowance (₹)','education_allowance'],['edit-conv','Conveyance (₹)','conveyance'],
              ['edit-pd','Professional Development (₹)','professional_development'],['edit-oa','Other Allowance (₹)','other_allowance'],
              ['edit-lta','LTA (₹)','lta'],['edit-epf','Employer PF (₹)','employer_pf'],
              ['edit-bonus','Bonus (₹)','bonus']].map(([id, label, key]) => (
              <div className="form-group" key={key}>
                <label className="form-label" htmlFor={id}>{label}</label>
                <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                  value={formData[key]}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  disabled={submitting} />
              </div>
            ))}
          </div>

          <p className="salary-section-heading">Deductions</p>
          <div className="form-grid-2">
            {[['edit-pfd','PF Deduction (₹)','pf_deduction'],['edit-pt','Professional Tax (₹)','professional_tax'],
              ['edit-tds','TDS (₹)','tds']].map(([id, label, key]) => (
              <div className="form-group" key={key}>
                <label className="form-label" htmlFor={id}>{label}</label>
                <input id={id} type="number" min="0" step="0.01" placeholder="0.00"
                  value={formData[key]}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  disabled={submitting} />
              </div>
            ))}
          </div>

          {/* Live computed summary */}
          {(() => {
            const f = formData;
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

          <div className="modal-actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: View Details */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Employee Profile"
      >
        {selectedEmployee && (
          <div className="profile-view-body">
            <div className="profile-hero-badge">
              <div className="profile-avatar">{selectedEmployee.name.charAt(0)}</div>
              <div>
                <h3>{selectedEmployee.name}</h3>
                <span className="text-muted text-sm">{selectedEmployee.designation || 'No Designation'}</span>
              </div>
            </div>

            <div className="profile-details-grid">
              <div className="profile-detail-item">
                <span className="profile-detail-label">Employee ID</span>
                <strong className="profile-detail-value">{selectedEmployee.employee_id}</strong>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Status</span>
                <span className={`status-pill ${selectedEmployee.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                  {selectedEmployee.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Email</span>
                <span className="profile-detail-value">{selectedEmployee.email}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Phone</span>
                <span className="profile-detail-value">{selectedEmployee.phone || '—'}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Date of Joining</span>
                <span className="profile-detail-value">
                  {selectedEmployee.date_of_joining ? selectedEmployee.date_of_joining.slice(0, 10) : '—'}
                </span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Monthly Salary</span>
                <strong className="profile-detail-value salary-rate-text">
                  ₹{parseFloat(selectedEmployee.monthly_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Account Created</span>
                <span className="profile-detail-value text-sm text-muted">
                  {new Date(selectedEmployee.created_at).toLocaleDateString('en-IN')}
                </span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">First Login Status</span>
                <span className="profile-detail-value text-sm profile-first-login-status">
                  {selectedEmployee.first_login ? (
                    <><AlertTriangle size={13} aria-hidden="true" /> Password Reset Pending</>
                  ) : (
                    <><CheckCircle2 size={13} aria-hidden="true" /> Password Initialized</>
                  )}
                </span>
              </div>
            </div>

            <div className="modal-actions-row">
              <button type="button" className="btn btn-ghost" onClick={() => setIsViewModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Deactivate / Reactivate Confirmation */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => !submitting && setIsConfirmModalOpen(false)}
        title={selectedEmployee?.status === 'active' ? 'Deactivate Employee' : 'Reactivate Employee'}
      >
        <div className="confirm-modal-body">
          <p>
            Are you sure you want to{' '}
            <strong>
              {selectedEmployee?.status === 'active' ? 'deactivate' : 'reactivate'}
            </strong>{' '}
            <strong>{selectedEmployee?.name}</strong> ({selectedEmployee?.employee_id})?
          </p>
          {selectedEmployee?.status === 'active' && (
            <p className="text-muted text-sm">
              Note: Historical attendance, leaves, and salary logs will be preserved. The employee will no longer be able to log in.
            </p>
          )}

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${selectedEmployee?.status === 'active' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggleStatus}
              disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : null}
              {selectedEmployee?.status === 'active' ? 'Confirm Deactivation' : 'Confirm Reactivation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Generated Temporary Credentials */}
      <Modal
        isOpen={Boolean(tempCredentialsModal)}
        onClose={() => setTempCredentialsModal(null)}
        title={
          <span className="modal-title-with-icon">
            <CheckCircle2 size={18} aria-hidden="true" /> Employee Onboarded Successfully
          </span>
        }
      >
        {tempCredentialsModal && (
          <div className="temp-creds-body">
            <div className="alert alert-info">
              <Info size={16} aria-hidden="true" />
              <span>Please share these temporary credentials securely with the employee. They will be forced to change their password upon first login.</span>
            </div>

            <div className="creds-box card">
              <div className="cred-row">
                <span className="cred-label">Employee ID:</span>
                <strong className="cred-val">{tempCredentialsModal.user.employee_id}</strong>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(tempCredentialsModal.user.employee_id, 'Employee ID')}
                >
                  <Copy size={13} aria-hidden="true" /> Copy
                </button>
              </div>

              <div className="cred-row">
                <span className="cred-label">Email:</span>
                <span className="cred-val">{tempCredentialsModal.user.email}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(tempCredentialsModal.user.email, 'Email')}
                >
                  <Copy size={13} aria-hidden="true" /> Copy
                </button>
              </div>

              <div className="cred-row">
                <span className="cred-label">Temporary Password:</span>
                <code className="cred-password">{tempCredentialsModal.temp_password}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(tempCredentialsModal.temp_password, 'Temporary Password')}
                >
                  <Copy size={13} aria-hidden="true" /> Copy
                </button>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTempCredentialsModal(null)}
              >
                Done & Continue
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
