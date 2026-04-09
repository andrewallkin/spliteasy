import { api } from '@/api/client'
import type { User } from '@/types/models'

export async function updateProfile(data: {
  display_name?: string
  profile_picture?: string | null
}) {
  const response = await api.patch<User>('/users/me', data)
  return response.data
}

export async function changePassword(current_password: string, new_password: string) {
  await api.post('/users/me/password', { current_password, new_password })
}
