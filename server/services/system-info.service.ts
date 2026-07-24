import os from 'node:os'
import process from 'node:process'
import { execSync } from 'node:child_process'
import { config } from '../config/index.js'
import { currentDbType } from '../db/connection.js'
import { getParam } from '../db/repositories.js'

export interface SystemInfo {
  hostname: string
  platform: string
  arch: string
  osRelease: string
  uptime: number
  cpus: number
  cpuModel: string
  totalMem: number
  freeMem: number
  usedMem: number
  memUsagePercent: number
  loadAvg: number[]
  nodeVersion: string
  processUptime: number
  processPid: number
  processMemMb: number
  cwd: string
  dbType: string
  pm2Available: boolean
  gitAvailable: boolean
  gitBranch: string
  gitCommit: string
  platformName: string
  platformVersion: string
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const cpus = os.cpus()
  const mem = process.memoryUsage()

  let gitBranch = ''
  let gitCommit = ''
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: config.update.projectRoot, windowsHide: true }).toString().trim()
  } catch { /* 非仓库环境 */ }
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd: config.update.projectRoot, windowsHide: true }).toString().trim()
  } catch { /* */ }

  const pm2Available = isAvailable('pm2')
  const gitAvailable = isAvailable('git')

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osRelease: os.release(),
    uptime: os.uptime(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMem,
    freeMem,
    usedMem,
    memUsagePercent: totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(2)) : 0,
    loadAvg: os.loadavg(),
    nodeVersion: process.version,
    processUptime: process.uptime(),
    processPid: process.pid,
    processMemMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
    cwd: process.cwd(),
    dbType: currentDbType(),
    pm2Available,
    gitAvailable,
    gitBranch,
    gitCommit,
    platformName: (await getParam('platform_name')) ?? '运营管理平台',
    platformVersion: (await getParam('platform_version')) ?? '1.0.0'
  }
}

function isAvailable(cmd: string): boolean {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`
  try {
    execSync(probe, { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d) parts.push(`${d}天`)
  if (h) parts.push(`${h}时`)
  if (m) parts.push(`${m}分`)
  parts.push(`${s}秒`)
  return parts.join(' ')
}
