import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getUpdateState, loadGlobalConfig, saveGlobalConfig, maskConfig,
  testGithubConnection, probeProxy, getShellInfo, getPackagesInfo,
  clearLogs
} from '../services/system-update.service.js'
import { ok, fail } from '../utils/response.js'
import { addOperationLog } from '../db/repositories.js'
import { findAppById } from '../db/app.repository.js'
import type { Request, Response } from 'express'

const router = Router()

/** 当前任务状态 */
router.get('/update/status', requireAuth, async (_req: Request, res: Response) => {
  ok(res, getUpdateState())
})

/** 全局更新配置（GitHub Token / 代理 / SSL / 包保留） */
router.get('/update/config', requireAuth, async (_req: Request, res: Response) => {
  ok(res, maskConfig(loadGlobalConfig()))
})

router.post('/update/config', requireAuth, async (req: Request, res: Response) => {
  const patch: Record<string, unknown> = {}
  for (const f of ['githubToken', 'proxy', 'sslVerify', 'packageKeep']) {
    if (req.body?.[f] !== undefined) patch[f] = req.body[f]
  }
  if (patch.githubToken === '******') delete patch.githubToken // 掩码回传保留原值
  const saved = saveGlobalConfig(patch)
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'update_config', description: '更新全局配置', extra: JSON.stringify({ proxy: saved.proxy, sslVerify: saved.sslVerify }) })
  ok(res, maskConfig(saved), '配置已保存')
})

/** 测试指定应用的 GitHub 连通性 */
router.get('/update/test-github', requireAuth, async (req: Request, res: Response) => {
  const appId = Number(req.query.appId)
  const app = appId ? await findAppById(appId) : null
  if (!app) return fail(res, '请指定有效的应用')
  const result = await testGithubConnection(app.repo_url, app.branch, loadGlobalConfig())
  ok(res, result)
})

/** 探测本地代理端口 */
router.get('/update/probe-proxy', requireAuth, async (_req: Request, res: Response) => {
  ok(res, await probeProxy())
})

/** 任务日志 */
router.get('/update/logs', requireAuth, async (_req: Request, res: Response) => {
  ok(res, getUpdateState().logs)
})

router.post('/update/clear-logs', requireAuth, async (req: Request, res: Response) => {
  clearLogs()
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'clear_logs', description: '清空更新日志' })
  ok(res, null, '日志已清空')
})

/** 环境信息 + 部署包列表 */
router.get('/update/env', requireAuth, async (req: Request, res: Response) => {
  const appName = req.query.app as string | undefined
  ok(res, { shell: getShellInfo(), packages: getPackagesInfo(appName) })
})

export default router
