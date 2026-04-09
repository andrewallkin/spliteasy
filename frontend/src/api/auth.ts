import { api } from '@/api/client'
import type { AuthResponse, User } from '@/types/models'

export async function login(email: string, password: string) {
  const response = await api.post<AuthResponse>('/auth/login', { email, password })
  return response.data
}

export async function register(
  email: string,
  display_name: string,
  password: string,
) {
  const response = await api.post<AuthResponse>('/auth/register', {
    email,
    display_name,
    password,
  })
  return response.data
}

export async function refresh() {
  const response = await api.post<{ access_token: string; token_type: string }>('/auth/refresh')
  return response.data
}

export async function logout() {
  await api.post('/auth/logout')
}

export async function me() {
  const response = await api.get<User>('/users/me')
  return response.data
}
