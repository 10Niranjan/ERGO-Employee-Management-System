import api from './axiosClient';

export const getHolidays   = (params = {}) => api.get('/holidays', { params }).then(r => r.data);
export const createHoliday = (body)        => api.post('/holidays', body).then(r => r.data);
export const updateHoliday = (id, body)    => api.put(`/holidays/${id}`, body).then(r => r.data);
export const deleteHoliday = (id)          => api.delete(`/holidays/${id}`).then(r => r.data);
