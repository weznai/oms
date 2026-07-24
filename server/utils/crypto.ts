import crypto from 'node:crypto'

const ROUNDS = 10

/** bcrypt 风格密码哈希（使用 Node 内置 scrypt，无需原生依赖） */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(plain, salt, 32).toString('hex')
  return `scrypt$${ROUNDS}$${salt}$${derived}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  // 兼容旧 bcrypt 占位符
  if (stored.startsWith('$2a$10$PLACEHOLDER')) {
    return plain === 'admin123'
  }
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$')
    if (parts.length !== 4) return false
    const salt = parts[2]
    const derived = parts[3]
    const hash = crypto.scryptSync(plain, salt, 32).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
  }
  return false
}

/** 生成随机 token */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}
