import api from './axiosClient';

export const getUsers      = (params = {}) => api.get('/users', { params }).then(r => r.data);
export const getUserById   = (id)          => api.get(`/users/${id}`).then(r => r.data);
export const createUser    = (body)        => api.post('/users', body).then(r => r.data);
export const updateUser    = (id, body)    => api.put(`/users/${id}`, body).then(r => r.data);
export const updateStatus  = (id, status)  => api.patch(`/users/${id}/status`, { status }).then(r => r.data);
