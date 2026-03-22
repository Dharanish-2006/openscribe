import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${BASE}/api/auth/token/refresh/`,
            { refresh }
          )
          localStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register:       (data) => api.post('/api/auth/register/', data),
  login:          (data) => api.post('/api/auth/login/', data),
  logout:         (refresh) => api.post('/api/auth/logout/', { refresh }),
  getProfile:     ()     => api.get('/api/auth/profile/'),
  updateProfile:  (data) => api.patch('/api/auth/profile/', data),
  changePassword: (data) => api.post('/api/auth/change-password/', data),
  deleteAccount:  ()     => api.delete('/api/auth/delete-account/'),
}

export default api