import { createAdapter, getDb, currentDbType } from '../db/connection.js'
import type { DbAdapter } from '../db/types.js'
import { addDbSyncLog } from '../db/repositories.js'
import { logger } from '../utils/logger.js'

export interface SyncTableResult {
  table: string
  rows: number
  status: 'ok' | 'skip' | 'error'
  message?: string
}

export interface SyncResult {
  sourceType: string
  targetType: string
  tables: string[]
  results: SyncTableResult[]
  totalRows: number
  durationMs: number
  status: 'success' | 'partial' | 'failed'
  message: string
}

/** 同步表数据（不含结构，结构需已存在），可指定表名集合，默认全部 */
export async function syncMysqlToSqlite(tableNames?: string[]): Promise<SyncResult> {
  const start = Date.now()
  const source = createAdapter('mysql')
  const target = createAdapter('sqlite')
  const results: SyncTableResult[] = []
  let totalRows = 0

  try {
    // 1. 获取源库表列表
    let tables = tableNames?.length ? tableNames : await getTableNames(source)
    // 只同步 sys_ 开头的业务表 + 用户自定义表（排除迁移表，避免冲突）
    tables = tables.filter((t) => t !== 'sys_schema_migration')

    // 2. 对每个表执行同步：确保目标存在结构 → 清空 → 拉取写入
    for (const table of tables) {
      try {
        await ensureTableStructure(source, target, table)
        const count = await copyTableData(source, target, table)
        results.push({ table, rows: count, status: 'ok' })
        totalRows += count
        logger.info(`同步表 ${table}: ${count} 行`)
      } catch (e) {
        const msg = (e as Error).message
        results.push({ table, rows: 0, status: 'error', message: msg })
        logger.warn(`同步表 ${table} 失败: ${msg}`)
      }
    }

    const durationMs = Date.now() - start
    const errorCount = results.filter((r) => r.status === 'error').length
    const status = errorCount === 0 ? 'success' : errorCount === results.length ? 'failed' : 'partial'

    const result: SyncResult = {
      sourceType: 'mysql',
      targetType: 'sqlite',
      tables,
      results,
      totalRows,
      durationMs,
      status,
      message: `同步完成: ${results.length} 张表, ${totalRows} 行, 耗时 ${durationMs}ms`
    }

    // 记录到主库（同步日志）。若主库当前是 sqlite 目标，则直接写入
    await addDbSyncLog({
      direction: 'mysql_to_sqlite',
      source_type: 'mysql',
      target_type: 'sqlite',
      tables: tables.join(','),
      status,
      detail: JSON.stringify(results),
      duration_ms: durationMs
    })

    return result
  } finally {
    await source.close()
    // target 不关闭（若是主库）
    if (currentDbType() !== 'sqlite') {
      await target.close()
    }
  }
}

async function getTableNames(db: DbAdapter): Promise<string[]> {
  if (db.type === 'sqlite') {
    const rows = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    return rows.map((r) => r.name)
  }
  const rows = await db.all<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
  )
  return rows.map((r) => r.name)
}

/** 在目标库创建与源库结构一致的表 */
async function ensureTableStructure(source: DbAdapter, target: DbAdapter, table: string): Promise<void> {
  if (target.type === 'sqlite') {
    // SQLite: 读取源列信息，生成 CREATE TABLE
    const cols = await getColumnsForSqlite(source, table)
    const exists = await target.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]
    )
    if (!exists) {
      const colDefs = cols.map((c) => `"${c.name}" ${c.type}`).join(', ')
      await target.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`)
    }
  } else {
    // MySQL 目标：CREATE TABLE LIKE 不支持跨库，这里简化处理
    await target.exec(`CREATE TABLE IF NOT EXISTS \`${table}\` LIKE \`${table}\``)
  }
}

interface SqliteCol { name: string; type: string }

async function getColumnsForSqlite(source: DbAdapter, table: string): Promise<SqliteCol[]> {
  if (source.type === 'sqlite') {
    const rows = await source.all<{ name: string; type: string }>(`PRAGMA table_info(${table})`)
    return rows.map((r) => ({ name: r.name, type: r.type || 'TEXT' }))
  }
  // MySQL → SQLite 类型映射
  const rows = await source.all<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`,
    [table]
  )
  return rows.map((r) => ({ name: r.column_name, type: mysqlToSqliteType(r.data_type) }))
}

function mysqlToSqliteType(mysqlType: string): string {
  const t = mysqlType.toLowerCase()
  if (['int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint'].includes(t)) return 'INTEGER'
  if (['float', 'double', 'decimal'].includes(t)) return 'REAL'
  return 'TEXT'
}

/** 拉取源表数据，清空目标表后批量写入 */
async function copyTableData(source: DbAdapter, target: DbAdapter, table: string): Promise<number> {
  const rows = (await source.all(`SELECT * FROM ${quoteIdent(source, table)}`)) as Record<string, unknown>[]
  if (rows.length === 0) return 0

  const columns = Object.keys(rows[0])
  const targetQ = quoteIdent(target, table)
  await target.exec(`DELETE FROM ${targetQ}`)

  const placeholders = columns.map(() => '?').join(', ')
  const colList = columns.map((c) => quoteCol(target, c)).join(', ')
  const sql = `INSERT INTO ${targetQ} (${colList}) VALUES (${placeholders})`

  await target.transaction(async () => {
    for (const row of rows) {
      await target.run(sql, columns.map((c) => row[c] ?? null))
    }
  })

  return rows.length
}

function quoteIdent(db: DbAdapter, name: string): string {
  return db.type === 'sqlite' ? `"${name}"` : `\`${name}\``
}

function quoteCol(db: DbAdapter, name: string): string {
  return db.type === 'sqlite' ? `"${name}"` : `\`${name}\``
}
