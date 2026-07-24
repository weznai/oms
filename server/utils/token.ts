import crypto from 'node:crypto'
import { config } from '../config/index.js'

export interface TokenPayload {
  id: number
  username: string
  role: string
  iat: number
  exp: number
}

const TTL = 24 * 60 * 60 * 1000 // 24 小时

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const now = Date.now()
  const full: TokenPayload = { ...payload, iat: now, exp: now + TTL }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = sign(body)
  return `${body}.${sig}`
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (sign(body) !== sig) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TokenPayload
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function sign(data: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url')
}
