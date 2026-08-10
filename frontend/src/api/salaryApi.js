import api from './axiosClient';

export const getSalaryRates             = (params = {}) => api.get('/salary', { params }).then(r => r.data);
export const updateSalaryRate           = (userId, body)=> api.put(`/salary/${userId}`, body).then(r => r.data);
export const getSalaryHistory           = (params = {}) => api.get('/salary/history', { params }).then(r => r.data);
export const getEmployeeSalaryHistory   = (userId)      => api.get(`/salary/${userId}/history`).then(r => r.data);
