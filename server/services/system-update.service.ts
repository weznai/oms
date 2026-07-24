import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync, execSync, type ChildProcess } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { matchAny } from '../utils/glob.js'
import type { AppRow } from '../db/app.repository.js'
import { buildPm2Action, parseExcludes } from './command-template.js'

export type Stage =
  | 'idle' | 'starting' | 'downloading' | 'deploying'
  | 'installing' | 'building' | 'restarting' | 'stopping'
  | 'done' | 'error'

export type UpdateMode = 'full' | 'download' | 'deploy' | 'install' | 'build' | 'restart' | 'stop'

export const VALID_MODES: UpdateMode[] = ['full', 'download', 'deploy', 'install', 'build', 'restart', 'stop']

export interface UpdateLogLine {
  t: number
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface UpdateState {
  appId: number | null
  appName: string
  appType: string
  stage: Stage
  running: boolean
  mode: UpdateMode | null
  progress: number
  message: string
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  logs: UpdateLogLine[]
}

/** 全局更新配置（GitHub 凭证 / 代理 / SSL / 包保留） */
export interface GlobalUpdateConfig {
  githubToken: string
  proxy: string
  sslVerify: boolean
  packageKeep: number
}

export interface ShellInfo {
  os: string
  platform: string
  shell: string
  defaultDeployDir: string
}

const CONFIG_FILE = path.join(config.projectRoot, 'update-config.json')

export const DEFAULT_DEPLOY_EXCLUDES = [
  'node_modules/**', '.git/**', 'db/**', '*.db', '*.db-shm', '*.db-wal',
  'logs/**', 'deploy/**', 'dist/**', 'server/dist/**', '.env', '.env.local',
  'update-config.json', '.vscode/**', '.idea/**', '*.log',
  '__pycache__/**', 'venv/**', '.venv/**', '*.pyc'
]

const DEFAULT_GLOBAL_CONFIG: GlobalUpdateConfig = {
  githubToken: config.update.githubToken,
  proxy: '',
  sslVerify: true,
  packageKeep: config.update.packageKeep
}

const MAX_LOGS = 1200

// ============ 全局状态单例（一次只跑一个应用的任务） ============
const state: UpdateState = {
  appId: null,
  appName: '',
  appType: '',
  stage: 'idle',
  running: false,
  mode: null,
  progress: 0,
  message: '空闲',
  startedAt: null,
  finishedAt: null,
  error: null,
  logs: []
}

export function getUpdateState(): UpdateState {
  return { ...state, logs: [...state.logs] }
}

export function isRunning(): boolean {
  return state.running
}

function pushLog(text: string, level: UpdateLogLine['level'] = 'info'): void {
  state.logs.push({ t: Date.now(), level, text })
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS)
  if (level === 'error') logger.error(text)
  else if (level === 'warn') logger.warn(text)
  else logger.info(text)
}

function setStage(stage: Stage, message: string, progress?: number): void {
  state.stage = stage
  state.message = message
  if (progress !== undefined) state.progress = progress
}

// ============ 全局配置持久化 ============
export function loadGlobalConfig(): GlobalUpdateConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      return { ...DEFAULT_GLOBAL_CONFIG, ...raw }
    }
  } catch (e) {
    logger.warn('读取 update-config.json 失败', e)
  }
  return { ...DEFAULT_GLOBAL_CONFIG }
}

const ALLOWED_FIELDS: (keyof GlobalUpdateConfig)[] = ['githubToken', 'proxy', 'sslVerify', 'packageKeep']

export function saveGlobalConfig(patch: Partial<GlobalUpdateConfig>): GlobalUpdateConfig {
  const cur = loadGlobalConfig()
  for (const k of ALLOWED_FIELDS) {
    if (patch[k] !== undefined) (cur as any)[k] = patch[k]
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cur, null, 2), 'utf-8')
  return cur
}

export function maskConfig(cfg: GlobalUpdateConfig): GlobalUpdateConfig {
  return { ...cfg, githubToken: cfg.githubToken ? '******' : '' }
}

// ============ axios 实例（带代理 + SSL） ============
async function getAxios(gcfg: GlobalUpdateConfig): Promise<typeof import('axios')> {
  const ax = await import('axios')
  // 代理配置
  const proxy = gcfg.proxy
  const httpsAgent = !gcfg.sslVerify
    ? new (await import('https')).Agent({ rejectUnauthorized: false })
    : undefined
  ;(ax.default as any).defaults.proxy = proxy ? parseProxy(proxy) : false
  if (httpsAgent) (ax.default as any).defaults.httpsAgent = httpsAgent
  return ax
}

function parseProxy(url: string): { protocol: string; host: string; port: number } {
  const m = url.match(/^(https?):\/\/([^:/]+):(\d+)/i)
  if (!m) return { protocol: 'http', host: '127.0.0.1', port: 7890 }
  return { protocol: m[1], host: m[2], port: Number(m[3]) }
}

// ============ 环境信息 ============
export function getShellInfo(): ShellInfo {
  const platform = process.platform
  const isWin = platform === 'win32'
  return {
    os: isWin ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux',
    platform,
    shell: isWin ? 'cmd.exe' : '/bin/bash',
    defaultDeployDir: path.join(config.projectRoot, 'deploy', 'packages')
  }
}

export function getPackagesInfo(appName?: string): { dir: string; count: number; entries: { name: string; mtime: string; size: number }[] } {
  const dir = path.join(config.projectRoot, 'deploy', 'packages')
  if (!fs.existsSync(dir)) return { dir, count: 0, entries: [] }
  let entries = fs.readdirSync(dir)
    .filter((n) => !appName || n.startsWith(`${appName}_`) || n.includes(`_${appName}_`))
    .map((name) => {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      return { name, mtime: stat.mtime.toISOString(), size: stat.isDirectory() ? dirSize(full) : stat.size }
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
  return { dir, count: entries.length, entries }
}

function dirSize(p: string): number {
  let total = 0
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else total += fs.statSync(full).size
  }
  return total
}

// ============ GitHub 下载 ============
function normalizeCodeloadUrl(url: string, branch: string): string {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i)
  if (!m) return url
  return `https://codeload.github.com/${m[1]}/${m[2]}/zip/refs/heads/${branch}`
}

export async function testGithubConnection(repoUrl: string, branch: string, gcfg: GlobalUpdateConfig): Promise<{ ok: boolean; message: string; statusCode?: number }> {
  if (!repoUrl) return { ok: false, message: '未配置仓库地址' }
  const url = normalizeCodeloadUrl(repoUrl, branch || 'main')
  try {
    const ax = await getAxios(gcfg)
    const res = await ax.default.head(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        ...(gcfg.githubToken ? { Authorization: `Bearer ${gcfg.githubToken}` } : {}),
        Range: 'bytes=0-0'
      },
      validateStatus: (s) => s < 500
    })
    if (res.status === 401 || res.status === 403) return { ok: false, message: '认证失败，请检查 Token', statusCode: res.status }
    if (res.status === 404) return { ok: false, message: '仓库或分支不存在', statusCode: 404 }
    return { ok: true, message: `连接正常 (${res.status})`, statusCode: res.status }
  } catch (e) {
    const err = e as Error & { code?: string }
    return { ok: false, message: `连接失败: ${err.code || err.message}` }
  }
}

async function downloadFile(url: string, dest: string, gcfg: GlobalUpdateConfig): Promise<void> {
  const ax = await getAxios(gcfg)
  const candidates = [url, url.replace(/\/refs\/heads\/[^/]+$/, '/refs/heads/master')]

  let lastErr: Error | null = null
  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i]
    for (let retry = 0; retry < 3; retry++) {
      try {
        pushLog(`下载: ${target} (第 ${retry + 1} 次尝试)${gcfg.proxy ? ` 经代理 ${gcfg.proxy}` : ''}${!gcfg.sslVerify ? ' [跳过SSL校验]' : ''}`)
        const res = await ax.default({
          method: 'GET',
          url: target,
          responseType: 'stream',
          timeout: 0,
          maxRedirects: 5,
          maxContentLength: Infinity,
          headers: gcfg.githubToken ? { Authorization: `Bearer ${gcfg.githubToken}` } : {}
        })
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        const stream = createWriteStream(dest)
        res.data.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) {
            const percent = Math.floor((received / total) * 100)
            setStage('downloading', `下载中 ${percent}% (${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`, percent)
          }
        })
        await pipeline(res.data, stream)
        pushLog(`下载完成: ${(received / 1024 / 1024).toFixed(2)} MB`)
        return
      } catch (e) {
        lastErr = e as Error
        pushLog(`下载失败(尝试 ${retry + 1}): ${(e as Error).message}`, 'warn')
      }
    }
  }
  throw lastErr ?? new Error('下载失败')
}

// ============ 解压 ============
function extractZip(zipPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  const isWin = process.platform === 'win32'
  if (isWin) {
    spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`], { windowsHide: true })
  } else {
    spawnSync('unzip', ['-o', zipPath, '-d', destDir])
  }
}

// ============ 部署文件 ============
function isExcluded(relPath: string, excludes: string[]): boolean {
  return matchAny(relPath, excludes)
}

function deployFiles(src: string, dest: string, excludes: string[]): { copied: number; skipped: number } {
  let copied = 0
  let skipped = 0
  const walk = (from: string, to: string): void => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const relFromRoot = path.relative(src, path.join(from, entry.name)).split(path.sep).join('/')
      if (isExcluded(relFromRoot, excludes)) {
        skipped++
        continue
      }
      const srcPath = path.join(from, entry.name)
      const destPath = path.join(to, entry.name)
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true })
        walk(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
        copied++
      }
    }
  }
  walk(src, dest)
  return { copied, skipped }
}

// ============ 执行命令 ============
function runCommand(cmd: string, cwd: string, timeout: number, logPrefix = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'cmd.exe' : '/bin/bash'
    const shellArg = isWin ? ['/c', cmd] : ['-c', cmd]
    const child: ChildProcess = spawn(shell, shellArg, { cwd, windowsHide: true })
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeout * 1000)

    child.stdout?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((line) => pushLog(`${logPrefix}${line}`)))
    child.stderr?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((line) => pushLog(`${logPrefix}${line}`, 'warn')))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (killed) return reject(new Error(`命令超时 (${timeout}s)`))
      if (code === 0) resolve()
      else reject(new Error(`命令退出码 ${code}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

// ============ PM2 控制 ============
function pm2AvailableSync(): boolean {
  const probe = process.platform === 'win32' ? 'where pm2' : 'command -v pm2'
  try {
    execSync(probe, { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function spawnPm2Command(action: 'restart' | 'stop', app: AppRow, cwd: string): void {
  const cmd = buildPm2Action(action, app)
  const isWin = process.platform === 'win32'
  const delayed = isWin ? `timeout /t 1 /nobreak >nul && ${cmd}` : `sleep 1 && ${cmd}`
  const ctrlLog = path.join(config.projectRoot, 'logs', 'pm2-control.log')
  fs.mkdirSync(path.dirname(ctrlLog), { recursive: true })
  const fd = fs.openSync(ctrlLog, 'a')
  const [shell, args] = isWin ? ['cmd.exe', ['/c', delayed]] : ['/bin/bash', ['-c', delayed]]
  spawn(shell, args, { cwd, detached: true, stdio: ['ignore', fd, fd], windowsHide: true }).unref()
  pushLog(`已触发 PM2 ${action} ${app.pm2_app_name}（延迟 1 秒，分离执行）`)
}

// ============ 应用启停（PM2 / 自定义命令） ============
async function restartApp(app: AppRow, cwd: string): Promise<void> {
  if (app.process_mode === 'custom') {
    if (!app.start_cmd) {
      pushLog('自定义模式未配置启动命令(start_cmd)，跳过重启', 'warn')
      return
    }
    pushLog(`执行自定义启动命令: ${app.start_cmd}`)
    try {
      await runCommand(app.start_cmd, cwd, 60, '[start] ')
      pushLog('自定义启动命令执行完成')
    } catch (e) {
      pushLog(`启动命令执行失败: ${(e as Error).message}`, 'warn')
    }
    return
  }
  // PM2 模式
  if (!pm2AvailableSync()) {
    pushLog('PM2 未安装。可安装: npm i -g pm2；或在应用配置里改用「自定义」启停命令。', 'warn')
    return
  }
  spawnPm2Command('restart', app, cwd)
}

async function stopApp(app: AppRow, cwd: string): Promise<void> {
  if (app.process_mode === 'custom') {
    if (!app.stop_cmd) {
      pushLog('自定义模式未配置停止命令(stop_cmd)，跳过停止', 'warn')
      return
    }
    pushLog(`执行自定义停止命令: ${app.stop_cmd}`)
    try {
      await runCommand(app.stop_cmd, cwd, 60, '[stop] ')
      pushLog('自定义停止命令执行完成')
    } catch (e) {
      pushLog(`停止命令执行失败: ${(e as Error).message}`, 'warn')
    }
    return
  }
  if (!pm2AvailableSync()) {
    pushLog('PM2 未安装，跳过停止操作', 'warn')
    return
  }
  spawnPm2Command('stop', app, cwd)
}

// ============ 代理探测 ============
export async function probeProxy(): Promise<{ port: number; available: boolean }[]> {
  const ports = [7890, 7891, 10808, 10809, 1080, 8080]
  const net = await import('node:net')
  return Promise.all(
    ports.map((port) => new Promise<{ port: number; available: boolean }>((resolve) => {
      const s = new net.Socket()
      s.setTimeout(800)
      s.once('connect', () => { s.destroy(); resolve({ port, available: true }) })
      s.once('error', () => { s.destroy(); resolve({ port, available: false }) })
      s.once('timeout', () => { s.destroy(); resolve({ port, available: false }) })
      s.connect(port, '127.0.0.1')
    }))
  )
}

// ============ 主任务流程 ============
export function runUpdateTask(app: AppRow, mode: UpdateMode, gcfg: GlobalUpdateConfig): Promise<void> {
  if (state.running) return Promise.reject(new Error('已有任务在运行中'))
  return executeUpdate(app, mode, gcfg)
}

async function executeUpdate(app: AppRow, mode: UpdateMode, gcfg: GlobalUpdateConfig): Promise<void> {
  state.running = true
  state.appId = app.id
  state.appName = app.name
  state.appType = app.type
  state.error = null
  state.progress = 0
  state.startedAt = Date.now()
  state.finishedAt = null
  state.logs = []

  try {
    setStage('starting', `开始任务: ${app.name} (${app.type}) ${mode}`, 5)
    pushLog(`========== 开始执行 [${app.name}] (${app.type}) ${mode} 任务 ==========`)

    const needDownload = ['full', 'download'].includes(mode)
    const needDeploy = ['full', 'deploy'].includes(mode)
    const needInstall = ['full', 'install'].includes(mode) && !!app.install_cmd
    const needBuild = ['full', 'build'].includes(mode) && app.build_enabled === 1 && !!app.build_cmd
    const needRestart = ['full', 'restart'].includes(mode)
    const needStop = mode === 'stop'

    const deployRoot = app.deploy_path || config.projectRoot
    let packageDir = ''

    if (needDownload) {
      if (!app.repo_url) throw new Error(`应用 ${app.name} 未配置仓库地址`)
      setStage('downloading', '准备下载...', 10)
      const packagesRoot = path.join(config.projectRoot, 'deploy', 'packages')
      fs.mkdirSync(packagesRoot, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      packageDir = path.join(packagesRoot, `${app.name}_${stamp}_${app.branch}`)
      fs.mkdirSync(packageDir, { recursive: true })
      const zipPath = path.join(packageDir, 'source.zip')
      const url = normalizeCodeloadUrl(app.repo_url, app.branch || 'main')
      await downloadFile(url, zipPath, gcfg)
      setStage('deploying', '解压源码包...', 30)
      const extractDir = path.join(packageDir, 'extract')
      extractZip(zipPath, extractDir)
      const top = fs.readdirSync(extractDir).filter((n) => fs.statSync(path.join(extractDir, n)).isDirectory())
      if (top.length === 1) {
        const moved = path.join(packageDir, 'source')
        fs.renameSync(path.join(extractDir, top[0]), moved)
        fs.rmSync(extractDir, { recursive: true, force: true })
      }
      prunePackages(packagesRoot, gcfg.packageKeep)
      pushLog('下载阶段完成')
    }

    if (needDeploy) {
      setStage('deploying', `部署文件到 ${deployRoot}...`, 40)
      const srcRoot = packageDir ? path.join(packageDir, 'source') : findLatestPackageSource(app.name)
      if (!srcRoot || !fs.existsSync(srcRoot)) throw new Error('找不到可部署的源码包，请先下载')
      const excludes = app.deploy_excludes ? parseExcludes(app.deploy_excludes) : DEFAULT_DEPLOY_EXCLUDES
      const res = deployFiles(srcRoot, deployRoot, excludes)
      pushLog(`部署完成: 复制 ${res.copied} 个文件，跳过 ${res.skipped} 个`)
      setStage('deploying', `部署完成 (复制 ${res.copied})`, 50)
    }

    if (needInstall) {
      setStage('installing', `安装依赖 (${app.install_cmd})...`, 55)
      await runCommand(app.install_cmd, deployRoot, 600, '[install] ')
      pushLog('依赖安装完成')
      setStage('installing', '依赖安装完成', 70)
    }

    if (needBuild) {
      setStage('building', `构建项目 (${app.build_cmd})...`, 75)
      await runCommand(app.build_cmd, deployRoot, 600, '[build] ')
      pushLog('构建完成')
      setStage('building', '构建完成', 90)
    }

    if (needStop) {
      setStage('stopping', '停止服务...', 95)
      await stopApp(app, deployRoot)
    }

    if (needRestart) {
      setStage('restarting', '重启服务...', 95)
      await restartApp(app, deployRoot)
    }

    setStage('done', '任务完成', 100)
    pushLog('========== 任务执行完成 ==========')
    state.finishedAt = Date.now()
  } catch (e) {
    const msg = (e as Error).message
    state.stage = 'error'
    state.error = msg
    state.message = `任务失败: ${msg}`
    state.finishedAt = Date.now()
    pushLog(`任务失败: ${msg}`, 'error')
  } finally {
    state.running = false
  }
}

function findLatestPackageSource(appName: string): string | null {
  const packagesRoot = path.join(config.projectRoot, 'deploy', 'packages')
  if (!fs.existsSync(packagesRoot)) return null
  const dirs = fs.readdirSync(packagesRoot)
    .filter((n) => n.startsWith(`${appName}_`))
    .map((n) => ({ name: n, full: path.join(packagesRoot, n) }))
    .filter((d) => fs.statSync(d.full).isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))
  if (!dirs.length) return null
  const sourceDir = path.join(dirs[0].full, 'source')
  return fs.existsSync(sourceDir) ? sourceDir : dirs[0].full
}

function prunePackages(root: string, keep: number): void {
  const dirs = fs.readdirSync(root)
    .map((n) => ({ name: n, full: path.join(root, n) }))
    .filter((d) => fs.statSync(d.full).isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))
  for (const d of dirs.slice(Math.max(keep, 1))) {
    try {
      fs.rmSync(d.full, { recursive: true, force: true })
      pushLog(`清理旧部署包: ${d.name}`)
    } catch (e) {
      pushLog(`清理失败: ${d.name} - ${(e as Error).message}`, 'warn')
    }
  }
}

export function clearLogs(): void {
  state.logs = []
}
