import type { DbType } from '../config/index.js'

export interface RunResult {
  changes: number
  lastInsertId: number | bigint
}

export interface DbAdapter {
  readonly type: DbType
  /** 查询多行 */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** 查询单行 */
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  /** 执行写操作 */
  run(sql: string, params?: unknown[]): Promise<RunResult>
  /** 批量执行原生 SQL（建表、迁移） */
  exec(sql: string): Promise<void>
  /** 事务包装 */
  transaction<T>(fn: () => Promise<T>): Promise<T>
  /** 关闭连接 */
  close(): Promise<void>
}

export interface TableInfo {
  name: string
  rowCount: number
  sizeKb: number
}
