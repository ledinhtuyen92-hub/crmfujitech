import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/',
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request Interceptor — tự động đính kèm Access Token ────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ── Response Interceptor — tự động refresh token khi hết hạn ───────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => {
    // Tự động trigger refresh notifications mỗi khi có thao tác thay đổi dữ liệu thành công
    const method = response.config?.method?.toLowerCase()
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      // Bỏ qua các endpoint không liên quan đến thông báo công việc (VD: chat)
      if (!response.config.url.includes('/messages/') && !response.config.url.includes('/chat/')) {
        window.dispatchEvent(new Event('refresh-notifications'))
      }
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Bỏ qua lỗi 401 từ API login để giao diện Login.jsx tự bắt và hiện thông báo
      if (originalRequest.url.includes('/login/')) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        // Không có refresh token → logout
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(
          'http://localhost:8000/api/users/token/refresh/',
          { refresh: refreshToken },
        )
        localStorage.setItem('accessToken', data.access)
        if (data.refresh) localStorage.setItem('refreshToken', data.refresh)

        api.defaults.headers['Authorization'] = `Bearer ${data.access}`
        originalRequest.headers['Authorization'] = `Bearer ${data.access}`
        processQueue(null, data.access)
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default api
