import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSystemInfo, formatBytes, formatUptime } from '../services/system-info.service.js'
import { ok } from '../utils/response.js'
import { listTables, getTableInfo } from '../db/repositories.js'
import type { Request, Response } from 'express'

const router = Router()

router.get('/info', requireAuth, async (_req: Request, res: Response) => {
  const info = await getSystemInfo()
  ok(res, {
    ...info,
    totalMemText: formatBytes(info.totalMem),
    freeMemText: formatBytes(info.freeMem),
    usedMemText: formatBytes(info.usedMem),
    uptimeText: formatUptime(info.uptime),
    processUptimeText: formatUptime(info.processUptime)
  })
})

router.get('/tables', requireAuth, async (_req: Request, res: Response) => {
  const tables = await listTables()
  ok(res, tables)
})

router.get('/tables/:name', requireAuth, async (req: Request, res: Response) => {
  const info = await getTableInfo(req.params.name)
  ok(res, info)
})

export default router
