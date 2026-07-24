import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type TokenPayload } from '../utils/token.js'

declare module 'express-serve-static-core' {
  interface Request {
    admin?: TokenPayload
  }
}

const HEADER = 'authorization'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers[HEADER] as string | undefined
  if (!auth) {
    res.status(401).json({ code: 401, message: '未登录', data: null })
    return
  }
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ code: 401, message: '登录已过期，请重新登录', data: null })
    return
  }
  req.admin = payload
  next()
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.admin || req.admin.role !== 'super_admin') {
    res.status(403).json({ code: 403, message: '需要管理员权限', data: null })
    return
  }
  next()
}
