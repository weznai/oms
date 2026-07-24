import http from '@/utils/http'

export interface LogQuery {
  page?: number
  pageSize?: number
  action?: string
  username?: string
  startDate?: number
  endDate?: number
}

export const logApi = {
  list: (params: LogQuery) => http.get('/logs', { params })
}
