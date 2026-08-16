import api from './axiosClient';

export const getSalaryRates             = (params = {}) => api.get('/salary', { params }).then(r => r.data);
export const updateSalaryRate           = (userId, body) => api.put(`/salary/${userId}`, body).then(r => r.data);
export const getSalaryHistory           = (params = {}) => api.get('/salary/history', { params }).then(r => r.data);
export const getEmployeeSalaryHistory   = (userId)      => api.get(`/salary/${userId}/history`).then(r => r.data);
// Employee-facing: own salary components only (scoped on the server to req.user.id)
export const getMySalaryComponents      = ()             => api.get('/salary/my').then(r => r.data);
