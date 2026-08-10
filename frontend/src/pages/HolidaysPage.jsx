import { useState, useEffect, useCallback } from 'react';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../api/holidayApi';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import './HolidaysPage.css';

export default function HolidaysPage() {
  const { showToast } = useToast();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  const [formData, setFormData] = useState({ name: '', date: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchHolidayList = useCallback(async (year) => {
    setLoading(true);
    setError('');
    try {
      const data = await getHolidays({ year });
      setHolidays(data.holidays || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch holiday calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidayList(selectedYear);
  }, [selectedYear, fetchHolidayList]);

  function handleOpenAdd() {
    setFormData({
      name: '',
      date: `${selectedYear}-01-01`,
    });
    setIsAddModalOpen(true);
  }

  function handleOpenEdit(h) {
    setSelectedHoliday(h);
    setFormData({
      name: h.name,
      date: h.date ? h.date.slice(0, 10) : '',
    });
    setIsEditModalOpen(true);
  }

  function handleOpenDelete(h) {
    setSelectedHoliday(h);
    setIsDeleteModalOpen(true);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.date) {
      showToast('Holiday name and date are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createHoliday({
        name: formData.name.trim(),
        date: formData.date,
      });
      showToast('Holiday added successfully!', 'success');
      setIsAddModalOpen(false);
      fetchHolidayList(selectedYear);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add holiday', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.date) {
      showToast('Holiday name and date are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateHoliday(selectedHoliday.id, {
        name: formData.name.trim(),
        date: formData.date,
      });
      showToast('Holiday updated successfully!', 'success');
      setIsEditModalOpen(false);
      fetchHolidayList(selectedYear);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update holiday', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!selectedHoliday) return;
    setSubmitting(true);
    try {
      await deleteHoliday(selectedHoliday.id);
      showToast('Holiday removed from calendar.', 'success');
      setIsDeleteModalOpen(false);
      fetchHolidayList(selectedYear);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete holiday', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function formatDayOfWeek(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'long' });
  }

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Company Holiday Calendar</h1>
          <p className="page-subtitle text-muted">
            Public and national holidays auto-exempt from attendance and leave deductions.
          </p>
        </div>
        <button
          type="button"
          id="add-holiday-btn"
          className="btn btn-primary"
          onClick={handleOpenAdd}
        >
          <span>+</span> Add Holiday
        </button>
      </div>

      {/* Year Selector Control */}
      <div className="page-controls card">
        <div className="year-selector-group">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedYear((y) => y - 1)}
          >
            ← {selectedYear - 1}
          </button>
          <span className="selected-year-badge">Calendar Year {selectedYear}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedYear((y) => y + 1)}
          >
            {selectedYear + 1} →
          </button>
        </div>

        <span className="text-muted text-sm">
          Total Holidays in {selectedYear}: <strong>{holidays.length}</strong>
        </span>
      </div>

      {/* Main Table */}
      <div className="table-card card">
        {loading ? (
          <div className="state-container">
            <span className="spinner" />
            <p className="text-muted">Loading holidays for {selectedYear}...</p>
          </div>
        ) : error ? (
          <div className="state-container">
            <span className="state-icon text-danger">⚠️</span>
            <p className="text-danger">{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => fetchHolidayList(selectedYear)}>
              Try Again
            </button>
          </div>
        ) : holidays.length === 0 ? (
          <div className="state-container">
            <span className="state-icon">📅</span>
            <h3>No holidays added for {selectedYear}</h3>
            <p className="text-muted text-sm">
              Click "+ Add Holiday" to add official holidays to this year's calendar.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day of Week</th>
                  <th>Holiday Name</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong className="holiday-date-text">{formatDateFriendly(h.date)}</strong>
                    </td>
                    <td>
                      <span className="text-muted text-sm">{formatDayOfWeek(h.date)}</span>
                    </td>
                    <td>
                      <strong className="emp-fullname">{h.name}</strong>
                    </td>
                    <td>
                      <span className="status-pill status-paid">Paid Public Holiday</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Edit Holiday"
                          onClick={() => handleOpenEdit(h)}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn action-deactivate"
                          title="Delete Holiday"
                          onClick={() => handleOpenDelete(h)}
                        >
                          🗑️
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

      {/* Modal: Add Holiday */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !submitting && setIsAddModalOpen(false)}
        title={`Add Holiday (${selectedYear})`}
      >
        <form onSubmit={handleAddSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="hol-add-name">
              Holiday Name *
            </label>
            <input
              id="hol-add-name"
              type="text"
              required
              placeholder="e.g. Independence Day, Diwali"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="hol-add-date">
              Holiday Date *
            </label>
            <input
              id="hol-add-date"
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              disabled={submitting}
            />
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
              {submitting ? 'Adding...' : 'Add Holiday'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Holiday */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !submitting && setIsEditModalOpen(false)}
        title="Edit Holiday"
      >
        <form onSubmit={handleEditSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="hol-edit-name">
              Holiday Name *
            </label>
            <input
              id="hol-edit-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="hol-edit-date">
              Holiday Date *
            </label>
            <input
              id="hol-edit-date"
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              disabled={submitting}
            />
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !submitting && setIsDeleteModalOpen(false)}
        title="Delete Holiday"
      >
        <div className="confirm-modal-body">
          <p>
            Are you sure you want to remove <strong>{selectedHoliday?.name}</strong> on{' '}
            <strong>{selectedHoliday?.date?.slice(0, 10)}</strong> from the calendar?
          </p>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteConfirm}
              disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : null}
              Delete Holiday
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
