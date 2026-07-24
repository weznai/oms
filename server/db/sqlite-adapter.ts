import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import type { DbAdapter, RunResult } from './types.js'

// 使用 Node 22.5+ 内置的 node:sqlite 模块（零原生编译依赖）
// API 参考 better-sqlite3，预处理语句由运行时自动管理（无 finalize）
export class SqliteAdapter implements DbAdapter {
  readonly type = 'sqlite' as const
  private db: DatabaseSync
  private txDepth = 0

  constructor(filePath: string) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new DatabaseSync(filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as any[])) as T[]
  }

  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const row = this.db.prepare(sql).get(...(params as any[])) as T | undefined
    return row ?? null
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const res = this.db.prepare(sql).run(...(params as any[])) as { changes: number; lastInsertRowid: number | bigint }
    return { changes: res.changes, lastInsertId: Number(res.lastInsertRowid) }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) {
      this.txDepth++
      try {
        return await fn()
      } finally {
        this.txDepth--
      }
    }
    return new Promise<T>((resolve, reject) => {
      this.db.exec('BEGIN')
      this.txDepth++
      fn()
        .then((val) => {
          this.db.exec('COMMIT')
          resolve(val)
        })
        .catch((err) => {
          this.db.exec('ROLLBACK')
          reject(err)
        })
        .finally(() => {
          this.txDepth--
        })
    })
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
