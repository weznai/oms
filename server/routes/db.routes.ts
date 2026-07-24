import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { addOperationLog, getDbSyncLogList, listTables, getTableInfo } from '../db/repositories.js'
import { switchDbType, currentDbType } from '../db/connection.js'
import { syncMysqlToSqlite } from '../services/db-sync.service.js'
import { initDatabase } from '../db/migrations.js'
import type { Request, Response } from 'express'

const router = Router()

/** 当前数据库状态 */
router.get('/status', requireAuth, async (_req: Request, res: Response) => {
  const tables = await listTables()
  ok(res, {
    type: currentDbType(),
    tableCount: tables.length,
    tables
  })
})

/** 切换数据库类型（重启后从 .env 决定主库；运行时切换用于查询演示） */
router.post('/switch', requireAuth, async (req: Request, res: Response) => {
  const type = req.body?.type as 'sqlite' | 'mysql'
  if (type !== 'sqlite' && type !== 'mysql') {
    return fail(res, '数据库类型仅支持 sqlite / mysql')
  }
  try {
    await switchDbType(type)
    await initDatabase()
    await addOperationLog({
      username: req.admin!.username,
      ip: req.ip || '',
      action: 'db_switch',
      description: `切换数据库到 ${type}`,
      extra: JSON.stringify({ type })
    })
    ok(res, { type }, `已切换到 ${type.toUpperCase()}`)
  } catch (e) {
    fail(res, `切换失败: ${(e as Error).message}`, 1, 500)
  }
})

/** MySQL → SQLite 同步 */
router.post('/sync/mysql-to-sqlite', requireAuth, async (req: Request, res: Response) => {
  const tables = req.body?.tables as string[] | undefined
  try {
    const result = await syncMysqlToSqlite(tables)
    await addOperationLog({
      username: req.admin!.username,
      ip: req.ip || '',
      action: 'db_sync',
      description: `MySQL 同步到 SQLite: ${result.message}`,
      extra: JSON.stringify({ tables: result.tables, status: result.status })
    })
    ok(res, result, result.message)
  } catch (e) {
    fail(res, `同步失败: ${(e as Error).message}`, 1, 500)
  }
})

/** 表详情 */
router.get('/tables/:name', requireAuth, async (req: Request, res: Response) => {
  const info = await getTableInfo(req.params.name)
  ok(res, info)
})

/** 同步日志 */
router.get('/sync-logs', requireAuth, async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 20
  ok(res, await getDbSyncLogList(page, pageSize))
})

export default router
