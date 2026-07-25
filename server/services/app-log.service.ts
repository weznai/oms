import fs from 'node:fs'
import path from 'node:path'
import { isPm2Available, getPm2LogPathMap } from './pm2.service.js'
import type { AppRow } from '../db/app.repository.js'

/** 单个日志文件最多读取尾部字节数（避免大日志文件撑爆内存） */
const TAIL_BYTES_HARD_LIMIT = 4 * 1024 * 1024
/** 默认与最大返回行数 */
const DEFAULT_LINES = 500
const MAX_LINES = 5000

export interface LogSource {
  key: string
  label: string
  path: string
  exists: boolean
  size: number
}

export interface AppLogResult {
  available: boolean
  message: string
  sources: LogSource[]
  source: string | null
  lines: string[]
  totalLines: number
  truncated: boolean
  fileSize: number
}

export interface ReadOptions {
  source?: string
  lines?: number
  keyword?: string
}

/** 解析一个应用可用的日志源：显式配置优先，其次 PM2 自动发现 */
export function resolveLogSources(app: AppRow): { sources: LogSource[]; note: string } {
  const configured = parseConfiguredPaths(app.log_file)

  if (configured.length > 0) {
    const sources = configured.map((p, i) => buildSource(sourceKey(i, configured.length), p))
    return { sources, note: '' }
  }

  if (app.process_mode === 'pm2' && app.pm2_app_name && isPm2Available()) {
    const map = getPm2LogPathMap()
    const info = map[app.pm2_app_name]
    const sources: LogSource[] = []
    if (info?.out) sources.push(buildSource('out', info.out))
    if (info?.err) sources.push(buildSource('error', info.err))
    if (sources.length) return { sources, note: '' }
    return { sources, note: `PM2 未发现「${app.pm2_app_name}」的日志路径，可能应用未启动或 PM2 刚安装` }
  }

  if (app.process_mode === 'custom') {
    return { sources: [], note: '自定义命令模式未配置日志文件，请在应用配置中填写「日志文件」' }
  }

  return { sources: [], note: '未配置日志文件路径（PM2 模式留空时自动从 PM2 读取）' }
}

function sourceKey(index: number, total: number): string {
  if (total === 1) return 'out'
  if (index === 0) return 'out'
  if (index === 1) return 'error'
  return `log${index + 1}`
}

function buildSource(key: string, filePath: string): LogSource {
  let exists = false
  let size = 0
  try {
    const stat = fs.statSync(filePath)
    exists = true
    size = stat.size
  } catch { /* 文件不存在 */ }
  return {
    key,
    label: labelForKey(key, filePath),
    path: filePath,
    exists,
    size
  }
}

function labelForKey(key: string, filePath: string): string {
  if (key === 'out') return '标准输出 (out)'
  if (key === 'error') return '错误日志 (error)'
  return path.basename(filePath) || key
}

function parseConfiguredPaths(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 读取应用日志尾部，支持按源选择、行数限制、关键字过滤 */
export function readAppLogs(app: AppRow, opts: ReadOptions = {}): AppLogResult {
  const { sources, note } = resolveLogSources(app)
  const existing = sources.filter((s) => s.exists)

  if (existing.length === 0) {
    return {
      available: false,
      message: note || sources.length ? '日志文件不存在或为空' : '未配置日志文件',
      sources,
      source: null,
      lines: [],
      totalLines: 0,
      truncated: false,
      fileSize: 0
    }
  }

  const wantLines = clampLines(opts.lines)
  const keyword = opts.keyword?.trim().toLowerCase() || ''

  // 选择目标源：指定且存在则用之，否则按 out > error > 其余 取第一个存在的
  let target = existing.find((s) => s.key === opts.source)
  if (!target) {
    target = existing.find((s) => s.key === 'out') ?? existing.find((s) => s.key === 'error') ?? existing[0]
  }

  const { lines: all, truncated } = readTailLines(target.path)
  const filtered = keyword ? all.filter((l) => l.toLowerCase().includes(keyword)) : all
  const start = Math.max(0, filtered.length - wantLines)
  const result = filtered.slice(start)

  return {
    available: true,
    message: '',
    sources,
    source: target.key,
    lines: result,
    totalLines: filtered.length,
    truncated: truncated || start > 0,
    fileSize: target.size
  }
}

function clampLines(n?: number): number {
  const v = Math.floor(Number(n) || DEFAULT_LINES)
  if (v < 1) return DEFAULT_LINES
  if (v > MAX_LINES) return MAX_LINES
  return v
}

/** 读取文件尾部（至多 TAIL_BYTES_HARD_LIMIT 字节），返回完整行 */
function readTailLines(filePath: string): { lines: string[]; truncated: boolean } {
  let size = 0
  try {
    size = fs.statSync(filePath).size
  } catch {
    return { lines: [], truncated: false }
  }
  if (size === 0) return { lines: [], truncated: false }

  const readSize = Math.min(size, TAIL_BYTES_HARD_LIMIT)
  const truncated = readSize < size
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(readSize)
    fs.readSync(fd, buf, 0, readSize, size - readSize)
    let text = buf.toString('utf-8')
    if (truncated) {
      // 从中间开始读取，首行大概率被截断，丢弃到第一个换行
      const firstNl = text.indexOf('\n')
      text = firstNl >= 0 ? text.slice(firstNl + 1) : ''
    }
    let allLines = text.length ? text.split(/\r?\n/) : []
    if (allLines.length && allLines[allLines.length - 1] === '') allLines.pop()
    return { lines: allLines, truncated }
  } finally {
    fs.closeSync(fd)
  }
}
