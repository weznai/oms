import { execSync } from 'node:child_process'
import { logger } from '../utils/logger.js'

export interface Pm2ProcessInfo {
  name: string
  status: string        // online / stopped / errored / launching / stopping
  pid: number
  cpu: number
  memory: number
  uptime: number
  restarts: number
}

let pm2AvailableCache: boolean | null = null

export function isPm2Available(): boolean {
  if (pm2AvailableCache !== null) return pm2AvailableCache
  const probe = process.platform === 'win32' ? 'where pm2' : 'command -v pm2'
  try {
    execSync(probe, { stdio: 'ignore', windowsHide: true })
    pm2AvailableCache = true
  } catch {
    pm2AvailableCache = false
  }
  return pm2AvailableCache
}

/** 读取 pm2 jlist，返回全部进程信息（带 8 秒缓存，避免每次请求都 fork 进程） */
let procCache: { t: number; data: Pm2ProcessInfo[] } | null = null
const PROC_CACHE_TTL = 8_000

export function getPm2Processes(): Pm2ProcessInfo[] {
  const now = Date.now()
  if (procCache && now - procCache.t < PROC_CACHE_TTL) return procCache.data
  if (!isPm2Available()) {
    procCache = { t: now, data: [] }
    return []
  }
  try {
    const out = execSync('pm2 jlist', {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 5000
    })
    // pm2 jlist 输出前可能带有 banner/警告/ANSI 码，仅提取首个 [ 到末尾 ] 的 JSON 数组
    const start = out.indexOf('[')
    const end = out.lastIndexOf(']')
    if (start === -1 || end <= start) throw new Error('pm2 jlist 输出非 JSON 数组')
    const list = JSON.parse(out.slice(start, end + 1)) as any[]
    const data = list.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status ?? 'unknown',
      pid: p.pid ?? 0,
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0
    }))
    procCache = { t: now, data }
    return data
  } catch (e) {
    logger.warn('读取 PM2 进程列表失败', e)
    procCache = { t: now, data: [] }
    return []
  }
}

/** name -> 进程信息 映射，便于按应用名查询 */
export function getPm2StatusMap(): Record<string, Pm2ProcessInfo> {
  const map: Record<string, Pm2ProcessInfo> = {}
  for (const p of getPm2Processes()) map[p.name] = p
  return map
}

export type Pm2Status = 'online' | 'stopped' | 'errored' | 'launching' | 'stopping' | 'not_managed' | 'pm2_missing'

/** 单个应用的运行状态（未纳入 PM2 管理返回 not_managed，PM2 未安装返回 pm2_missing） */
export function getAppRunStatus(appName: string): Pm2Status {
  if (!isPm2Available()) return 'pm2_missing'
  const map = getPm2StatusMap()
  return (map[appName]?.status as Pm2Status) ?? 'not_managed'
}

/** 重置 PM2 可用性与进程缓存（安装/卸载后调用） */
export function resetPm2Cache(): void {
  pm2AvailableCache = null
  procCache = null
}

/** 全局安装 PM2（npm i -g pm2），返回结果 */
export function installPm2(): { ok: boolean; message: string } {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    execSync(`${npm} install -g pm2`, {
      windowsHide: true,
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8'
    })
    resetPm2Cache()
    return { ok: true, message: 'PM2 安装成功' }
  } catch (e) {
    const err = e as Error & { stderr?: string }
    const detail = (err.stderr || err.message || '').toString().split('\n').slice(-3).join(' ').trim()
    return { ok: false, message: `安装失败${detail ? '：' + detail : '（可能需要 sudo 权限，或检查 npm 全局目录）'}` }
  }
}
