import mysql from 'mysql2/promise'
import type { Pool, PoolConnection } from 'mysql2/promise'
import type { DbAdapter, RunResult } from './types.js'

export class MysqlAdapter implements DbAdapter {
  readonly type = 'mysql' as const
  private pool: Pool
  private txConn: PoolConnection | null = null
  private txDepth = 0

  constructor(opts: {
    host: string
    port: number
    user: string
    password: string
    database: string
    connectionLimit: number
  }) {
    this.pool = mysql.createPool({
      host: opts.host,
      port: opts.port,
      user: opts.user,
      password: opts.password,
      database: opts.database,
      connectionLimit: opts.connectionLimit,
      waitForConnections: true,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+08:00'
    })
  }

  private async conn(): Promise<Pool | PoolConnection> {
    return this.txConn ?? this.pool
  }

  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await this.conn()
    const [rows] = await c.query(sql, params)
    return rows as T[]
  }

  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const c = await this.conn()
    const [rows] = await c.query(sql, params)
    const list = rows as T[]
    return list[0] ?? null
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const c = await this.conn()
    const [res] = await c.query(sql, params)
    const r = res as { affectedRows: number; insertId: number }
    return { changes: r.affectedRows, lastInsertId: r.insertId }
  }

  async exec(sql: string): Promise<void> {
    const c = await this.conn()
    // mysql2 批量执行需用 multipleStatements，这里按语句拆分
    const stmts = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const s of stmts) {
      await c.query(s)
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txConn) {
      // 嵌套事务用 savepoint
      this.txDepth++
      try {
        return await fn()
      } finally {
        this.txDepth--
      }
    }
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      this.txConn = conn
      this.txDepth++
      const result = await fn()
      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      this.txConn = null
      this.txDepth--
      conn.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
