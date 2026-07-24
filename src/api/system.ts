import http from '@/utils/http'

export const systemApi = {
  info: () => http.get('/system/info'),
  tables: () => http.get('/system/tables'),
  tableDetail: (name: string) => http.get(`/system/tables/${name}`)
}
