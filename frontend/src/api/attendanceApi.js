import api from './axiosClient';

export const markAttendance        = (body)       => api.post('/attendance', body).then(r => r.data);
export const getTodayAttendance    = ()           => api.get('/attendance/today').then(r => r.data);
export const getMonthlyAttendance  = (params = {})=> api.get('/attendance/monthly', { params }).then(r => r.data);
export const getTeamAttendance     = (params = {})=> api.get('/attendance/team', { params }).then(r => r.data);
export const requestCorrection     = (id, body)   => api.post(`/attendance/${id}/correction`, body).then(r => r.data);
export const getCorrections        = (params = {})=> api.get('/attendance/corrections', { params }).then(r => r.data);
export const reviewCorrection      = (id, body)   => api.put(`/attendance/${id}/correction/review`, body).then(r => r.data);
export const overrideAttendance    = (id, body)   => api.put(`/attendance/${id}/override`, body).then(r => r.data);
