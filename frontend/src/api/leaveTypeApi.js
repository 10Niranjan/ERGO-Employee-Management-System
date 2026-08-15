import api from './axiosClient';

export const getLeaveTypes         = (params = {}) => api.get('/leave-types', { params }).then(r => r.data);
export const createLeaveType       = (body)        => api.post('/leave-types', body).then(r => r.data);
export const updateLeaveType       = (id, body)    => api.put(`/leave-types/${id}`, body).then(r => r.data);
export const toggleLeaveTypeStatus = (id, is_active) => api.patch(`/leave-types/${id}/status`, { is_active }).then(r => r.data);
