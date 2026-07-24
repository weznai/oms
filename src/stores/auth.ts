import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AdminProfile {
  id: number
  username: string
  displayName: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('ops_token') || '')
  const admin = ref<AdminProfile | null>(
    JSON.parse(localStorage.getItem('ops_admin') || 'null')
  )

  const isLogin = computed(() => !!token.value)
  const isSuperAdmin = computed(() => admin.value?.role === 'super_admin')

  function setAuth(t: string, a: AdminProfile): void {
    token.value = t
    admin.value = a
    localStorage.setItem('ops_token', t)
    localStorage.setItem('ops_admin', JSON.stringify(a))
  }

  function logout(): void {
    token.value = ''
    admin.value = null
    localStorage.removeItem('ops_token')
    localStorage.removeItem('ops_admin')
  }

  return { token, admin, isLogin, isSuperAdmin, setAuth, logout }
})
