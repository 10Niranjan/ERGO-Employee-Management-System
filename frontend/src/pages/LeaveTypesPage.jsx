import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Info,
  Lock,
  Palmtree,
  Pencil,
  Plus,
  Unlock,
} from 'lucide-react';
import {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  toggleLeaveTypeStatus,
} from '../api/leaveTypeApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './LeaveTypesPage.css';

export default function LeaveTypesPage() {
  const { showToast } = useToast();

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    is_paid: true,
    yearly_quota: 12,
  });
  const [submitting, setSubmitting] = useState(false);

  async function fetchTypes() {
    setLoading(true);
    setError('');
    try {
      const data = await getLeaveTypes({ include_inactive: true });
      setLeaveTypes(data.leave_types || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch leave types');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTypes();
  }, []);

  function handleOpenAdd() {
    setFormData({
      name: '',
      is_paid: true,
      yearly_quota: 10,
    });
    setIsAddModalOpen(true);
  }

  function handleOpenEdit(lt) {
    setSelectedType(lt);
    setFormData({
      name: lt.name,
      is_paid: lt.is_paid,
      yearly_quota: lt.yearly_quota,
    });
    setIsEditModalOpen(true);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Leave type name is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createLeaveType({
        name: formData.name.trim(),
        is_paid: Boolean(formData.is_paid),
        yearly_quota: parseInt(formData.yearly_quota, 10) || 0,
      });
      showToast('Leave type created successfully!', 'success');
      setIsAddModalOpen(false);
      fetchTypes();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create leave type', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Leave type name is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateLeaveType(selectedType.id, {
        name: formData.name.trim(),
        is_paid: Boolean(formData.is_paid),
        yearly_quota: parseInt(formData.yearly_quota, 10) || 0,
      });
      showToast('Leave type updated successfully!', 'success');
      setIsEditModalOpen(false);
      fetchTypes();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update leave type', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(lt) {
    const nextStatus = !lt.is_active;
    try {
      await toggleLeaveTypeStatus(lt.id, nextStatus);
      showToast(
        `"${lt.name}" ${nextStatus ? 'activated' : 'deactivated'} successfully!`,
        'success'
      );
      fetchTypes();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  }

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Leave Type Configuration</h1>
          <p className="page-subtitle text-muted">
            Configure company leave categories, yearly quotas, and paid/unpaid status.
          </p>
        </div>
        <button
          type="button"
          id="add-leave-type-btn"
          className="btn btn-primary"
          onClick={handleOpenAdd}
        >
          <Plus size={15} aria-hidden="true" /> Add Leave Type
        </button>
      </div>

      {/* Leave Policy Notice Banner */}
      <div className="policy-banner card">
        <Info className="policy-icon" size={20} aria-hidden="true" />
        <div className="policy-text">
          <strong>Annual Reset Policy:</strong> Unused leave balances reset annually and do not carry forward. Paid leave types are compensated at 100% per-day rate, while Unpaid Leaves deduct from monthly compensation.
        </div>
      </div>

      {/* Main Grid / Table */}
      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading leave categories...</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <AlertTriangle className="state-icon text-danger" size={40} aria-hidden="true" />
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={fetchTypes}>
              Try Again
            </button>
          </div>
        ) : leaveTypes.length === 0 ? (
          <div className="state-container">
            <Palmtree className="state-icon" size={40} aria-hidden="true" />
            <h3>No leave types configured</h3>
            <p className="text-muted text-sm">
              Click "+ Add Leave Type" to set up your first leave category.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Leave Type Name</th>
                  <th>Compensation Category</th>
                  <th>Default Yearly Quota</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((lt) => (
                  <tr key={lt.id} className={!lt.is_active ? 'row-inactive' : ''}>
                    <td>
                      <strong className="emp-fullname">{lt.name}</strong>
                    </td>
                    <td>
                      <span className={`status-pill ${lt.is_paid ? 'status-paid' : 'status-unpaid'}`}>
                        {lt.is_paid ? 'Paid Leave (100%)' : 'Unpaid (Deducted)'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 'var(--font-size-md)' }}>
                        {lt.yearly_quota} {lt.yearly_quota === 1 ? 'day' : 'days'} / yr
                      </strong>
                    </td>
                    <td>
                      <span className={`status-pill ${lt.is_active ? 'status-active' : 'status-inactive'}`}>
                        {lt.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Edit Quota & Settings"
                          onClick={() => handleOpenEdit(lt)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`action-icon-btn ${lt.is_active ? 'action-deactivate' : 'action-reactivate'}`}
                          title={lt.is_active ? 'Deactivate Leave Type' : 'Activate Leave Type'}
                          onClick={() => handleToggleStatus(lt)}
                        >
                          {lt.is_active ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />}
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

      {/* Modal: Add Leave Type */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !submitting && setIsAddModalOpen(false)}
        title="Add New Leave Type"
      >
        <form onSubmit={handleAddSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="lt-add-name">
              Leave Type Name *
            </label>
            <input
              id="lt-add-name"
              type="text"
              required
              placeholder="e.g. Maternity Leave, Study Leave"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="lt-add-quota">
              Yearly Quota (Days) *
            </label>
            <input
              id="lt-add-quota"
              type="number"
              min="0"
              required
              placeholder="e.g. 12"
              value={formData.yearly_quota}
              onChange={(e) => setFormData({ ...formData, yearly_quota: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Compensation Type *</label>
            <div className="radio-options-row">
              <label className="radio-label">
                <input
                  type="radio"
                  name="add_is_paid"
                  checked={formData.is_paid === true}
                  onChange={() => setFormData({ ...formData, is_paid: true })}
                  disabled={submitting}
                />
                <span>Paid (Full salary)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="add_is_paid"
                  checked={formData.is_paid === false}
                  onChange={() => setFormData({ ...formData, is_paid: false })}
                  disabled={submitting}
                />
                <span>Unpaid (Salary deducted)</span>
              </label>
            </div>
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsAddModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Creating...' : 'Create Leave Type'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Leave Type */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !submitting && setIsEditModalOpen(false)}
        title={`Edit Leave Type (${selectedType?.name})`}
      >
        <form onSubmit={handleEditSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="lt-edit-name">
              Leave Type Name *
            </label>
            <input
              id="lt-edit-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="lt-edit-quota">
              Yearly Quota (Days) *
            </label>
            <input
              id="lt-edit-quota"
              type="number"
              min="0"
              required
              value={formData.yearly_quota}
              onChange={(e) => setFormData({ ...formData, yearly_quota: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Compensation Type *</label>
            <div className="radio-options-row">
              <label className="radio-label">
                <input
                  type="radio"
                  name="edit_is_paid"
                  checked={formData.is_paid === true}
                  onChange={() => setFormData({ ...formData, is_paid: true })}
                  disabled={submitting}
                />
                <span>Paid (Full salary)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="edit_is_paid"
                  checked={formData.is_paid === false}
                  onChange={() => setFormData({ ...formData, is_paid: false })}
                  disabled={submitting}
                />
                <span>Unpaid (Salary deducted)</span>
              </label>
            </div>
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsEditModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
