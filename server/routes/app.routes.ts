import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { addOperationLog } from '../db/repositories.js'
import {
  listApps, findAppById, createApp, updateApp, deleteApp, setAppEnabled,
  type AppInput
} from '../db/app.repository.js'
import { COMMAND_TEMPLATES } from '../services/command-template.js'
import { runUpdateTask, VALID_MODES, VALID_SOURCES, loadGlobalConfig, type UpdateMode, type UpdateSource } from '../services/system-update.service.js'
import { getPm2StatusMap } from '../services/pm2.service.js'
import type { Request, Response } from 'express'

const router = Router()

/** 应用列表（附带 PM2 实际运行状态） */
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  const apps = await listApps()
  const pm2Map = getPm2StatusMap()
  const enriched = apps.map((a) => ({
    ...a,
    runStatus: a.pm2_app_name ? (pm2Map[a.pm2_app_name]?.status ?? 'not_managed') : 'not_managed',
    runPid: a.pm2_app_name ? (pm2Map[a.pm2_app_name]?.pid ?? 0) : 0
  }))
  ok(res, enriched)
})

/** 命令模板（按类型） */
router.get('/templates', requireAuth, async (_req: Request, res: Response) => {
  ok(res, COMMAND_TEMPLATES)
})

/** 应用详情 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const app = await findAppById(Number(req.params.id))
  if (!app) return fail(res, '应用不存在', 1, 404)
  ok(res, app)
})

/** 新增应用 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const data = normalizeInput(req.body)
  if (!data.name) return fail(res, '应用名称不能为空')
  try {
    const id = await createApp(data)
    await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'app_create', description: `新增应用 ${data.name}`, extra: JSON.stringify({ id, type: data.type }) })
    ok(res, { id }, '应用已创建')
  } catch (e) {
    fail(res, `创建失败: ${(e as Error).message}`)
  }
})

/** 编辑应用 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const exists = await findAppById(id)
  if (!exists) return fail(res, '应用不存在', 1, 404)
  const data = normalizeInput(req.body)
  try {
    await updateApp(id, data)
    await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'app_update', description: `更新应用 ${data.name}` })
    ok(res, null, '应用已更新')
  } catch (e) {
    fail(res, `更新失败: ${(e as Error).message}`)
  }
})

/** 启用/停用 */
router.patch('/:id/enabled', requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const enabled = !!req.body?.enabled
  await setAppEnabled(id, enabled)
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'app_toggle', description: `${enabled ? '启用' : '停用'}应用 #${id}` })
  ok(res, null, enabled ? '已启用' : '已停用')
})

/** 删除应用 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const app = await findAppById(id)
  if (!app) return fail(res, '应用不存在', 1, 404)
  await deleteApp(id)
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'app_delete', description: `删除应用 ${app.name}` })
  ok(res, null, '已删除')
})

/** 针对应用执行任务：发布/更新/重启/停止 */
router.post('/:id/run', requireAuth, async (req: Request, res: Response) => {
  const mode = req.body?.mode as UpdateMode
  if (!VALID_MODES.includes(mode)) {
    return fail(res, `无效的模式，可选: ${VALID_MODES.join(', ')}`)
  }
  const source: UpdateSource = req.body?.source === 'git' ? 'git' : 'zip'
  if (!VALID_SOURCES.includes(source)) {
    return fail(res, `无效的拉取方式，可选: ${VALID_SOURCES.join(', ')}`)
  }
  const app = await findAppById(Number(req.params.id))
  if (!app) return fail(res, '应用不存在', 1, 404)
  if (!app.enabled) return fail(res, '应用已停用，请先启用')
  const gcfg = loadGlobalConfig()
  try {
    runUpdateTask(app, mode, gcfg, source).catch(() => { /* 错误已写入 state */ })
    await addOperationLog({
      username: req.admin!.username,
      ip: req.ip || '',
      action: 'system_update',
      description: `执行应用 ${app.name} (${app.type}) 任务: ${mode} [${source}]`,
      extra: JSON.stringify({ appId: app.id, mode, source, type: app.type })
    })
    ok(res, { mode, appName: app.name }, '任务已开始')
  } catch (e) {
    fail(res, (e as Error).message)
  }
})

function normalizeInput(body: any): AppInput {
  return {
    name: String(body?.name ?? '').trim(),
    display_name: String(body?.displayName ?? body?.display_name ?? '').trim(),
    type: (['nodejs', 'python', 'java'].includes(body?.type) ? body.type : 'nodejs') as AppInput['type'],
    scope: body?.scope === 'external' ? 'external' : 'internal',
    repo_url: String(body?.repoUrl ?? body?.repo_url ?? '').trim(),
    branch: String(body?.branch ?? 'main').trim() || 'main',
    deploy_path: String(body?.deployPath ?? body?.deploy_path ?? '').trim(),
    pm2_app_name: String(body?.pm2AppName ?? body?.pm2_app_name ?? '').trim(),
    port: body?.port ? Number(body.port) : null,
    install_cmd: String(body?.installCmd ?? body?.install_cmd ?? '').trim(),
    build_cmd: String(body?.buildCmd ?? body?.build_cmd ?? '').trim(),
    build_enabled: !!body?.buildEnabled,
    start_file: String(body?.startFile ?? body?.start_file ?? '').trim(),
    interpreter: String(body?.interpreter ?? '').trim(),
    process_mode: body?.processMode === 'custom' ? 'custom' : 'pm2',
    start_cmd: String(body?.startCmd ?? body?.start_cmd ?? '').trim(),
    stop_cmd: String(body?.stopCmd ?? body?.stop_cmd ?? '').trim(),
    deploy_excludes: String(body?.deployExcludes ?? body?.deploy_excludes ?? '').trim(),
    enabled: body?.enabled !== false,
    remark: String(body?.remark ?? '').trim()
  }
}

export default router
