import type { Response } from 'express'

export interface ApiOk<T = unknown> {
  code: 0
  message: string
  data: T
}

export interface ApiFail {
  code: number
  message: string
  data: null
}

export function ok<T>(res: Response, data: T, message = '操作成功'): void {
  res.json({ code: 0, message, data } satisfies ApiOk<T>)
}

export function fail(res: Response, message: string, code = 1, status = 400): void {
  res.status(status).json({ code, message, data: null } satisfies ApiFail)
}
