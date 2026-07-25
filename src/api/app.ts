import http from '@/utils/http'

export type AppType = 'nodejs' | 'python' | 'java'
export type AppScope = 'internal' | 'external'
export type ProcessMode = 'pm2' | 'custom'

export interface AppItem {
  id: number
  name: string
  display_name: string
  type: AppType
  scope: AppScope
  repo_url: string
  branch: string
  deploy_path: string
  pm2_app_name: string
  port: number | null
  install_cmd: string
  build_cmd: string
  build_enabled: number
  start_file: string
  interpreter: string
  process_mode: ProcessMode
  start_cmd: string
  stop_cmd: string
  deploy_excludes: string
  access_url: string
  enabled: number
  remark: string | null
  created_at: number
  updated_at: number
  runStatus: string
  runPid: number
  canControl: boolean
}

export interface AppInput {
  name: string
  display_name: string
  type: AppType
  scope: AppScope
  repo_url: string
  branch: string
  deploy_path: string
  pm2_app_name: string
  port: number | null
  install_cmd: string
  build_cmd: string
  build_enabled: boolean
  start_file: string
  interpreter: string
  process_mode: ProcessMode
  start_cmd: string
  stop_cmd: string
  deploy_excludes: string
  access_url: string
  enabled: boolean
  remark: string
}

export const appApi = {
  list: () => http.get<any, { data: AppItem[] }>('/apps'),
  templates: () => http.get('/apps/templates'),
  detail: (id: number) => http.get<any, { data: AppItem }>(`/apps/${id}`),
  create: (data: AppInput) => http.post('/apps', data),
  update: (id: number, data: AppInput) => http.put(`/apps/${id}`, data),
  toggle: (id: number, enabled: boolean) => http.patch(`/apps/${id}/enabled`, { enabled }),
  remove: (id: number) => http.delete(`/apps/${id}`),
  run: (id: number, mode: string, source?: 'zip' | 'git') => http.post(`/apps/${id}/run`, { mode, source })
}
