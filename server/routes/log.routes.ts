import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { getOperationLogList } from '../db/repositories.js'
import type { Request, Response } from 'express'

const router = Router()

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 20
  const result = await getOperationLogList({
    page,
    pageSize,
    action: req.query.action as string | undefined,
    username: req.query.username as string | undefined,
    startDate: req.query.startDate ? Number(req.query.startDate) : undefined,
    endDate: req.query.endDate ? Number(req.query.endDate) : undefined
  })
  ok(res, result)
})

export default router
