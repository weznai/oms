import http from '@/utils/http'

export type UpdateMode = 'full' | 'download' | 'deploy' | 'install' | 'build' | 'start' | 'restart' | 'stop'

export interface GlobalUpdateConfig {
  githubToken: string
  proxy: string
  sslVerify: boolean
  packageKeep: number
}

export const updateApi = {
  status: () => http.get('/system/update/status'),
  config: () => http.get<any, { data: GlobalUpdateConfig }>('/system/update/config'),
  saveConfig: (data: Partial<GlobalUpdateConfig>) => http.post('/system/update/config', data),
  testGithub: (appId: number) => http.get('/system/update/test-github', { params: { appId } }),
  probeProxy: () => http.get('/system/update/probe-proxy'),
  checkSsl: (appId: number) => http.get('/system/update/check-ssl', { params: { appId } }),
  logs: () => http.get('/system/update/logs'),
  clearLogs: () => http.post('/system/update/clear-logs'),
  env: (appName?: string) => http.get('/system/update/env', { params: { app: appName } }),
  installPm2: () => http.post('/system/update/install-pm2')
}
