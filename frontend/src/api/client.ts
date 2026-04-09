import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((response) => {
        const token = response.data.access_token as string
        setAccessToken(token)
        return token
      })
      .catch(() => {
        setAccessToken(null)
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status !== 401 || originalRequest?.url?.includes('/auth/refresh')) {
      throw error
    }
    const token = await refreshAccessToken()
    if (!token) {
      throw error
    }
    originalRequest.headers.Authorization = `Bearer ${token}`
    return api.request(originalRequest)
  },
)
