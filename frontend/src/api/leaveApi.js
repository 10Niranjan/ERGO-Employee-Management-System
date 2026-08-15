import api from './axiosClient';

export const getLeaveBalances       = (params = {}) => api.get('/leaves/balances', { params }).then(r => r.data);
export const applyLeave             = (body)        => api.post('/leaves', body).then(r => r.data);
export const getLeaveApplications   = (params = {}) => api.get('/leaves', { params }).then(r => r.data);
export const reviewLeaveApplication = (id, body)    => api.put(`/leaves/${id}/status`, body).then(r => r.data);
export const getLeaveLedger         = (params = {}) => api.get('/leaves/ledger', { params }).then(r => r.data);
export const getAccrualRuns         = (params = {}) => api.get('/leaves/accrual/runs', { params }).then(r => r.data);
export const runAccrual             = (body = {})   => api.post('/leaves/accrual/run', body).then(r => r.data);
