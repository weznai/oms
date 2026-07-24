import http from '@/utils/http'

export interface AdminProfile {
  id: number
  username: string
  displayName: string
  role: string
  lastLoginAt: number | null
}

export const authApi = {
  login: (username: string, password: string) =>
    http.post('/auth/login', { username, password }),
  logout: () => http.post('/auth/logout'),
  profile: () => http.get<any, { data: AdminProfile }>('/auth/profile'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.put('/auth/password', { oldPassword, newPassword })
}
