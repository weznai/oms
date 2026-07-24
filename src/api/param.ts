import http from '@/utils/http'

export interface ParamItem {
  id: number
  key: string
  value: string
  remark: string | null
  updated_at: number
  created_at: number
}

export const paramApi = {
  list: () => http.get<any, { data: ParamItem[] }>('/params'),
  save: (data: { key: string; value: string; remark?: string }) => http.post('/params', data),
  remove: (key: string) => http.delete(`/params/${key}`)
}
