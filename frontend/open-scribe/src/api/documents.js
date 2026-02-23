import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export const documentsAPI = {
  list: () => api.get('/documents/'),
  get: (id) => api.get(`/documents/${id}/`),
  create: (data) => api.post('/documents/', data),
  update: (id, data) => api.patch(`/documents/${id}/`, data),
  delete: (id) => api.delete(`/documents/${id}/`),
}