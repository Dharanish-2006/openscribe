import axios from 'axios'

// VITE_API_URL = https://openscribe.onrender.com/api/auth  (production)
// VITE_API_URL = http://localhost:8000/api/auth             (local)
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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/token/refresh/`, { refresh })
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
  register:       (data) => api.post('/register/', data),
  login:          (data) => api.post('/login/', data),
  logout:         (refresh) => api.post('/logout/', { refresh }),
  getProfile:     ()     => api.get('/profile/'),
  updateProfile:  (data) => api.patch('/profile/', data),
  changePassword: (data) => api.post('/change-password/', data),
  deleteAccount:  ()     => api.delete('/delete-account/'),
}

export default api