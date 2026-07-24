import http from '@/utils/http'

export const dbApi = {
  status: () => http.get('/db/status'),
  switch: (type: 'sqlite' | 'mysql') => http.post('/db/switch', { type }),
  syncMysqlToSqlite: (tables?: string[]) => http.post('/db/sync/mysql-to-sqlite', { tables }),
  tableDetail: (name: string) => http.get(`/db/tables/${name}`),
  syncLogs: (page = 1, pageSize = 20) => http.get('/db/sync-logs', { params: { page, pageSize } })
}
