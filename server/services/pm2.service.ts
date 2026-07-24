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

/** 读取 pm2 jlist，返回全部进程信息 */
export function getPm2Processes(): Pm2ProcessInfo[] {
  if (!isPm2Available()) return []
  try {
    const out = execSync('pm2 jlist', {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 5000
    })
    const list = JSON.parse(out) as any[]
    return list.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status ?? 'unknown',
      pid: p.pid ?? 0,
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0
    }))
  } catch (e) {
    logger.warn('读取 PM2 进程列表失败', e)
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
