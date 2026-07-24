import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { getAllParams, getParam, setParam, deleteParam } from '../db/repositories.js'
import { addOperationLog } from '../db/repositories.js'
import type { Request, Response } from 'express'

const router = Router()

router.get('/', requireAuth, async (_req: Request, res: Response) => {
  ok(res, await getAllParams())
})

router.get('/:key', requireAuth, async (req: Request, res: Response) => {
  const value = await getParam(req.params.key)
  if (value === null) return fail(res, '参数不存在', 1, 404)
  ok(res, { key: req.params.key, value })
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { key, value, remark } = req.body ?? {}
  if (!key) return fail(res, 'key 不能为空')
  await setParam(key, value ?? '', remark)
  await addOperationLog({
    username: req.admin!.username,
    ip: req.ip || '',
    action: 'param_save',
    description: `保存系统参数 ${key}`,
    extra: JSON.stringify({ key, value })
  })
  ok(res, { key, value, remark }, '保存成功')
})

router.delete('/:key', requireAuth, async (req: Request, res: Response) => {
  await deleteParam(req.params.key)
  await addOperationLog({
    username: req.admin!.username,
    ip: req.ip || '',
    action: 'param_delete',
    description: `删除系统参数 ${req.params.key}`
  })
  ok(res, null, '已删除')
})

export default router
