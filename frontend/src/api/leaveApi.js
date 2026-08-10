import api from './axiosClient';

export const getLeaveBalances       = (params = {}) => api.get('/leaves/balances', { params }).then(r => r.data);
export const applyLeave             = (body)        => api.post('/leaves', body).then(r => r.data);
export const getLeaveApplications   = (params = {}) => api.get('/leaves', { params }).then(r => r.data);
export const reviewLeaveApplication = (id, body)    => api.put(`/leaves/${id}/status`, body).then(r => r.data);
