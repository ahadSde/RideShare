import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  logout:   ()     => api.post('/auth/logout'),
  me:       ()     => api.get('/auth/me'),
};

export const rideAPI = {
  post:   (data)         => api.post('/rides', data),
  search: (params)       => api.get('/rides/search', { params }),
  book:   (rideId, data) => api.post(`/rides/${rideId}/book`, data),
  start:  (rideId)       => api.patch(`/rides/${rideId}/start`),
  my:     ()             => api.get('/rides/my'),
};

export const fareAPI = {
  calculate: (data)   => api.post('/fare/calculate', data),
  estimate:  (params) => api.get('/fare/estimate', { params }),
};

export const paymentAPI = {
  createOrder: (data)      => api.post('/payment/create-order', data),
  verify:      (data)      => api.post('/payment/verify', data),
  status:      (bookingId) => api.get(`/payment/status/${bookingId}`),
};

export default api;