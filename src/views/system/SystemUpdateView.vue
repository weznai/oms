<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download, Files, Box, Tools, Refresh, SwitchButton, VideoPlay,
  RefreshRight, Upload, Delete, Connection, Search, Lock
} from '@element-plus/icons-vue'
import { appApi, type AppItem } from '@/api/app'
import { updateApi } from '@/api/update'

interface UpdateLogLine { t: number; level: string; text: string }
interface UpdateState {
  appId: number | null; appName: string; appType: string
  stage: string; running: boolean; mode: string | null; progress: number
  message: string; startedAt: number | null; finishedAt: number | null
  error: string | null; logs: UpdateLogLine[]
}
interface ActionItem {
  mode: string; label: string; desc: string; icon: any
  color: string; danger?: boolean; disabled?: boolean
}

const props = defineProps<{ appId: number | null }>()
const apps = ref<AppItem[]>([])
const selectedApp = computed(() => apps.value.find((a) => a.id === props.appId) || null)

const state = ref<UpdateState>(emptyState())
const polling = ref<number | null>(null)
const logRef = ref<HTMLDivElement>()

const gconfig = reactive({ githubToken: '', proxy: '', sslVerify: true, packageKeep: 3 })
const showConfig = ref(false)
const testing = ref(false)
const probing = ref(false)
const checking = ref(false)
const envInfo = ref<{ shell?: any; packages?: any }>({})
const source = ref<'zip' | 'git'>('zip')

function emptyState(): UpdateState {
  return {
    appId: null, appName: '', appType: '', stage: 'idle', running: false, mode: null,
    progress: 0, message: '空闲', startedAt: null, finishedAt: null, error: null, logs: []
  }
}

const stageMeta: Record<string, { label: string; color: string }> = {
  idle: { label: '空闲', color: '#909399' },
  starting: { label: '准备中', color: '#2563eb' },
  downloading: { label: '下载中', color: '#3b82f6' },
  deploying: { label: '部署中', color: '#3b82f6' },
  installing: { label: '装依赖', color: '#f59e0b' },
  building: { label: '构建中', color: '#06b6d4' },
  restarting: { label: '重启中', color: '#10b981' },
  stopping: { label: '停止中', color: '#ef4444' },
  done: { label: '完成', color: '#10b981' },
  error: { label: '失败', color: '#ef4444' }
}

const updateActions = computed<ActionItem[]>(() => {
  if (!selectedApp.value) return []
  const isPy = selectedApp.value.type === 'python'
  const isGit = source.value === 'git'
  return [
    { mode: 'download', label: isGit ? 'git拉取' : '下载', desc: isGit ? 'git fetch+reset 到部署目录' : '下载分支压缩包', icon: Download, color: '#3b82f6' },
    { mode: 'deploy', label: '部署', desc: '部署文件到目录', icon: Files, color: '#3b82f6' },
    { mode: 'install', label: '装依赖', desc: isPy ? 'pip install' : 'npm install', icon: Box, color: '#f59e0b' },
    { mode: 'build', label: '编译', desc: isPy ? 'Python 通常跳过' : '执行构建', icon: Tools, color: '#06b6d4', disabled: isPy && selectedApp.value.build_enabled !== 1 }
  ]
})

const runActions = computed<ActionItem[]>(() => {
  if (!selectedApp.value) return []
  const rs = selectedApp.value.runStatus
  return [
    { mode: 'start', label: '启动', desc: 'PM2 启动', icon: VideoPlay, color: '#22c55e', disabled: rs === 'online' || rs === 'launching' },
    { mode: 'restart', label: '重启', desc: 'PM2 重启', icon: Refresh, color: '#10b981' },
    { mode: 'stop', label: '停止', desc: 'PM2 停止', icon: SwitchButton, color: '#ef4444', danger: true, disabled: rs === 'stopped' || rs === 'stopping' }
  ]
})

const stageInfo = computed(() => stageMeta[state.value.stage] ?? stageMeta.idle)
const canAct = computed(() => !!selectedApp.value && selectedApp.value.enabled === 1 && !state.value.running)
const otherAppRunning = computed(() =>
  state.value.running && !!selectedApp.value && state.value.appId !== null && state.value.appId !== selectedApp.value.id
)

async function loadStatus(): Promise<void> {
  const res = await updateApi.status()
  const wasRunning = state.value.running
  state.value = res.data
  if (wasRunning && !res.data.running) {
    if (res.data.stage === 'done') ElMessage.success(`[${res.data.appName}] 任务执行完成`)
    else if (res.data.stage === 'error') ElMessage.error(res.data.error || '任务失败')
    stopPolling()
    await loadApps()
  }
  await scrollLog()
}

async function loadApps(): Promise<void> {
  const res = await appApi.list()
  apps.value = res.data
}

async function loadConfig(): Promise<void> {
  const res = await updateApi.config()
  Object.assign(gconfig, res.data)
}

async function loadEnv(): Promise<void> {
  const res = await updateApi.env(selectedApp.value?.name)
  envInfo.value = res.data
}

watch(() => props.appId, () => { loadEnv() })

function startPolling(): void {
  if (polling.value) return
  polling.value = window.setInterval(loadStatus, 2000)
}
function stopPolling(): void {
  if (polling.value) { clearInterval(polling.value); polling.value = null }
}

async function scrollLog(): Promise<void> {
  await nextTick()
  if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
}

const modeTextMap: Record<string, string> = {
  full: '一键发布更新（拉取→装依赖→构建→重启）',
  download: '拉取源码', deploy: '部署文件', install: '安装依赖',
  build: '编译构建', start: '启动服务', restart: '重启服务', stop: '停止服务'
}

async function run(mode: string): Promise<void> {
  if (!selectedApp.value) { ElMessage.warning('请先选择目标应用'); return }
  const text = modeTextMap[mode]
  const useSource = ['full', 'download'].includes(mode)
  const danger = mode === 'stop' || mode === 'full' || mode === 'restart'
  const extra = useSource ? `（${source.value === 'git' ? 'git 拉取' : '下载包'}）` : ''
  if (mode !== 'start') {
    try {
      await ElMessageBox.confirm(
        `确定对应用「${selectedApp.value.display_name || selectedApp.value.name}」执行「${text}${extra}」吗？${danger ? '服务可能会短暂中断。' : ''}`,
        '操作确认',
        { type: danger ? 'error' : 'warning', confirmButtonText: '确定执行', cancelButtonText: '取消' }
      )
    } catch { return }
  }
  await appApi.run(selectedApp.value.id, mode, source.value)
  ElMessage.success('任务已开始')
  startPolling()
}

async function runFull(): Promise<void> { await run('full') }

async function saveConfig(): Promise<void> {
  await updateApi.saveConfig(gconfig)
}

async function handleSaveConfig(): Promise<void> {
  await saveConfig()
  ElMessage.success('配置已保存')
}

async function testGithub(): Promise<void> {
  if (!selectedApp.value) { ElMessage.warning('请先选择应用'); return }
  if (!selectedApp.value.repo_url) { ElMessage.warning('该应用未配置仓库地址'); return }
  testing.value = true
  try {
    await saveConfig()
    const res = await updateApi.testGithub(selectedApp.value.id)
    if (res.data.ok) ElMessage.success(res.data.message)
    else ElMessage.warning(res.data.message)
  } finally { testing.value = false }
}

async function probeProxy(): Promise<void> {
  probing.value = true
  try {
    const res = await updateApi.probeProxy()
    const available = res.data.filter((p: any) => p.available).map((p: any) => p.port)
    if (available.length) {
      ElMessage.success(`检测到代理端口: ${available.join(', ')}`)
      if (!gconfig.proxy) gconfig.proxy = `http://127.0.0.1:${available[0]}`
    } else { ElMessage.info('未检测到本地代理') }
  } finally { probing.value = false }
}

async function checkSsl(): Promise<void> {
  if (!selectedApp.value) { ElMessage.warning('请先选择应用'); return }
  checking.value = true
  try {
    await saveConfig()
    const res = await updateApi.checkSsl(selectedApp.value.id)
    const d: any = res.data
    const lines: string[] = []
    if (d.cert) {
      lines.push(`主体(CN): ${d.cert.subject || '-'}`)
      lines.push(`颁发者: ${d.cert.issuer || '-'}`)
      lines.push(`有效期: ${d.cert.validFrom} ~ ${d.cert.validTo}`)
      if (d.cert.daysLeft !== null) lines.push(`剩余天数: ${d.cert.daysLeft}${d.cert.expired ? '（已过期）' : ''}`)
      lines.push(`受系统信任: ${d.cert.trusted ? '是' : '否'}`)
      lines.push('———')
    }
    lines.push(`当前策略: ${d.sslVerify ? '严格校验' : '跳过校验'}`)
    lines.push(`检查结果: ${d.message}`)
    ElMessageBox.alert(lines.join('\n'), `SSL 证书检查 · ${d.target}`, {
      type: d.ok ? 'success' : 'warning',
      confirmButtonText: '知道了'
    })
  } catch { ElMessage.error('SSL 检查失败') }
  finally { checking.value = false }
}

async function clearLogs(): Promise<void> {
  await updateApi.clearLogs()
  state.value.logs = []
  ElMessage.success('日志已清空')
}

function logClass(line: UpdateLogLine): string {
  if (line.level === 'error') return 'log-error'
  if (line.level === 'warn') return 'log-warn'
  if (line.text.includes('===')) return 'log-divider'
  return ''
}

function fmtTime(t: number | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false })
}

onMounted(async () => {
  await Promise.all([loadStatus(), loadApps(), loadConfig()])
  await loadEnv()
  if (state.value.running) startPolling()
})
onUnmounted(stopPolling)
</script>

<template>
  <div class="update-page">
    <!-- 应用信息 -->
    <el-card v-if="selectedApp" shadow="never" class="panel">
      <div class="app-info-bar">
        <div class="info-tags">
          <el-tag size="small" :type="selectedApp.type === 'python' ? 'warning' : selectedApp.type === 'java' ? 'danger' : 'success'">
            {{ selectedApp.type === 'python' ? 'Python' : selectedApp.type === 'java' ? 'Java' : 'Node.js' }}
          </el-tag>
          <el-tag size="small" type="info" effect="plain">{{ selectedApp.scope === 'internal' ? '内部' : '外部' }}</el-tag>
          <el-tag v-if="selectedApp.port" size="small" type="primary" effect="plain">端口 {{ selectedApp.port }}</el-tag>
          <el-tag size="small" :type="selectedApp.enabled === 1 ? 'success' : 'info'" effect="plain">
            {{ selectedApp.enabled === 1 ? '已启用' : '已停用' }}
          </el-tag>
        </div>
        <div class="info-meta">
          <span class="meta-item"><span class="meta-k">PM2</span><span class="meta-v">{{ selectedApp.pm2_app_name || '-' }}</span></span>
          <span class="meta-item" v-if="selectedApp.repo_url">
            <span class="meta-k">仓库</span><span class="meta-v repo-v">{{ selectedApp.repo_url }} ({{ selectedApp.branch }})</span>
          </span>
          <span class="meta-item" v-if="envInfo.packages?.dir">
            <span class="meta-k">部署目录</span><span class="meta-v repo-v">{{ envInfo.packages.dir }}</span>
          </span>
          <span class="meta-item" v-if="envInfo.packages">
            <span class="meta-k">部署包</span><span class="meta-v">{{ envInfo.packages.count ?? 0 }} 个</span>
          </span>
        </div>
      </div>
      <div class="status-banner" :style="{ '--stage-color': stageInfo.color }">
        <span class="status-dot" :style="{ background: stageInfo.color }">
          <span v-if="state.running" class="pulse"></span>
        </span>
        <div class="status-main">
          <div class="status-stage">{{ stageInfo.label }}<span v-if="state.appName" class="run-app"> · {{ state.appName }}</span></div>
          <div class="status-msg">{{ state.message }}</div>
          <div v-if="otherAppRunning" class="status-warn">⚠ 正在执行「{{ state.appName }}」的任务，本应用操作需等待完成</div>
        </div>
        <div class="status-right">
          <div class="status-progress" v-if="state.running || state.progress > 0">
            <el-progress :percentage="state.progress" :color="stageInfo.color" :stroke-width="6" :show-text="false" />
            <span class="progress-text">{{ state.progress }}% · {{ fmtTime(state.startedAt) }} → {{ fmtTime(state.finishedAt) }}</span>
          </div>
          <el-button class="status-refresh" :icon="Refresh" text @click="loadStatus">刷新</el-button>
        </div>
      </div>
    </el-card>

    <!-- 启停 · 更新 -->
    <el-card shadow="never" class="panel" v-if="selectedApp">
      <template #header><span class="panel-title"><el-icon style="margin-right:4px;vertical-align:-2px;color:#2563eb"><Upload /></el-icon>启停 · 更新</span></template>

      <div class="grid-caption">进程启停</div>
      <div class="action-grid cols-3">
        <div
          v-for="a in runActions"
          :key="a.mode"
          class="action-card"
          :class="{ danger: a.danger, disabled: !canAct }"
          @click="(!a.disabled && canAct) ? run(a.mode) : null"
        >
          <div class="action-icon" :style="{ background: a.color }">
            <el-icon :size="12"><component :is="a.icon" /></el-icon>
          </div>
          <span class="action-label">{{ a.label }}</span>
        </div>
      </div>

      <div class="hero-row">
        <el-button type="primary" class="full-btn" :loading="state.running" :disabled="!canAct" @click="runFull">
          <el-icon style="margin-right:5px"><RefreshRight /></el-icon>一键发布更新
        </el-button>
        <div class="hero-side">
          <el-radio-group v-model="source" size="small">
            <el-radio-button value="zip">下载包 (zip)</el-radio-button>
            <el-radio-button value="git" disabled>git pull（暂未启用）</el-radio-button>
          </el-radio-group>
          <div class="hero-hint">完整执行：{{ source === 'git' ? 'git 拉取' : '下载 → 部署' }} → 安装 → 构建 → 重启</div>
        </div>
      </div>

      <div class="grid-caption">分步更新（{{ source === 'git' ? 'git 拉取' : '下载包' }}）</div>
      <div class="action-grid cols-4">
        <div
          v-for="a in updateActions"
          :key="a.mode"
          class="action-card"
          :class="{ danger: a.danger, disabled: a.disabled || !canAct }"
          @click="(!a.disabled && canAct) ? run(a.mode) : null"
        >
          <div class="action-icon" :style="{ background: a.color }">
            <el-icon :size="12"><component :is="a.icon" /></el-icon>
          </div>
          <span class="action-label">{{ a.label }}</span>
        </div>
      </div>
    </el-card>

    <el-empty v-else description="未选择应用" />

    <!-- 更新日志 -->
    <el-card v-if="selectedApp" shadow="never" class="panel">
      <template #header>
        <div class="panel-head">
          <span class="panel-title">更新日志</span>
          <div class="log-head-actions">
            <span class="global-hint">汇总所有应用</span>
            <el-tag size="small" effect="plain">共 {{ state.logs.length }} 条</el-tag>
            <el-button size="small" :icon="Delete" @click="clearLogs">清空日志</el-button>
          </div>
        </div>
      </template>
      <div ref="logRef" class="terminal">
        <div v-if="!state.logs.length" class="log-line log-divider"># 暂无日志</div>
        <div v-for="(line, i) in state.logs" :key="i" class="log-line" :class="logClass(line)">{{ line.text }}</div>
      </div>
    </el-card>

    <!-- 全局配置（GitHub 凭证 / 代理 / SSL） -->
    <el-card v-if="selectedApp" shadow="never" class="panel">
      <template #header>
        <div class="panel-head">
          <span class="panel-title">全局配置（GitHub 凭证 / 代理 / SSL）</span>
          <el-button text @click="showConfig = !showConfig">{{ showConfig ? '收起' : '展开' }}</el-button>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="showConfig">
          <el-alert
            type="info" :closable="false" show-icon style="margin-bottom:16px"
            title="仓库地址、分支、部署目录等在「应用管理」里按应用配置；此处仅维护跨应用通用的 GitHub Token、网络代理与 SSL 校验。"
          />
          <el-form :model="gconfig" label-width="120px" label-position="right">
            <el-form-item label="GitHub Token">
              <el-input v-model="gconfig.githubToken" placeholder="私有仓库需要" show-password />
            </el-form-item>
            <el-form-item label="HTTP/HTTPS 代理">
              <el-input v-model="gconfig.proxy" placeholder="http://127.0.0.1:7890，留空直连" />
            </el-form-item>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="SSL 证书校验">
                  <div class="ssl-control">
                    <el-switch v-model="gconfig.sslVerify" />
                    <span class="hint">{{ gconfig.sslVerify ? '严格校验' : '跳过(内网/自签证书)' }}</span>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="部署包保留">
                  <el-input-number v-model="gconfig.packageKeep" :min="1" :max="20" controls-position="right" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item>
              <el-button :icon="Connection" :loading="testing" @click="testGithub">测试当前应用连接</el-button>
              <el-button :icon="Search" :loading="probing" @click="probeProxy">探测本地代理</el-button>
              <el-button :icon="Lock" :loading="checking" @click="checkSsl">SSL 证书检查</el-button>
              <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.update-page :deep(.el-card) { border-radius: 6px; }
.update-page :deep(.el-card__body) { padding: 8px 14px; }
.update-page :deep(.el-card__header) { padding: 6px 14px; min-height: 30px; }
.update-page .panel { margin-bottom: 10px; }
.update-page .panel:last-child { margin-bottom: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-weight: 600; font-size: 14px; }

/* 应用信息卡 */
.app-info-bar {
  display: flex;
  flex-direction: column;
  gap: 5px;
  .info-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .info-meta { display: flex; gap: 16px; flex-wrap: wrap; }
  .meta-item { display: flex; align-items: baseline; gap: 6px; }
  .meta-k {
    font-size: 11px;
    color: #94a3b8;
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 4px;
  }
  .meta-v { font-size: 12.5px; color: #475569; }
  .repo-v { font-family: 'Cascadia Code', Consolas, monospace; font-size: 12px; color: #64748b; }
}

/* 状态横幅 */
.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  margin-top: 6px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--stage-color) 10%, transparent), color-mix(in srgb, var(--stage-color) 4%, transparent));
  border: 1px solid color-mix(in srgb, var(--stage-color) 22%, transparent);
  .status-dot {
    width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; position: relative;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--stage-color) 18%, transparent);
    .pulse { position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: pulse 1.4s ease-out infinite; }
  }
  .status-main { flex-shrink: 0; }
  .status-stage { font-size: 14px; font-weight: 600; color: #1e293b; }
  .run-app { color: #94a3b8; font-weight: 400; font-size: 12px; }
  .status-msg { font-size: 12px; color: #64748b; margin-top: 1px; }
  .status-warn { font-size: 12px; color: #d97706; margin-top: 2px; }
  .status-right { margin-left: auto; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .status-refresh { flex-shrink: 0; color: #94a3b8; }
  .status-progress { flex: 1; max-width: 320px; .progress-text { font-size: 11px; color: #94a3b8; display: block; margin-top: 2px; text-align: right; } }
}
@keyframes pulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.4); opacity: 0; } }

/* 启停 · 更新 */
.grid-caption { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.hero-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 8px 0;
  .full-btn {
    height: 30px; padding: 0 18px; font-size: 13px; font-weight: 600; letter-spacing: 1px; flex-shrink: 0;
    border: none; background: var(--brand-grad);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
    &:hover { box-shadow: 0 6px 16px rgba(37, 99, 235, 0.38); transform: translateY(-1px); }
    &:disabled { box-shadow: none; }
  }
  .hero-side { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
  .hero-hint { font-size: 11px; color: #b1b7c0; }
}

/* 操作按钮（紧凑） */
.action-grid { display: grid; gap: 6px; }
.action-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
.action-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.action-card {
  display: flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 6px;
  border: 1px solid var(--border-light); border-radius: 5px; cursor: pointer; transition: all 0.2s;
  background: #fff;
  &:hover { border-color: var(--brand-1); transform: translateY(-1px); box-shadow: 0 3px 8px rgba(37, 99, 235, 0.12); }
  &:hover .action-icon { transform: scale(1.06); }
  &.danger:hover { border-color: #ef4444; box-shadow: 0 3px 8px rgba(239, 68, 68, 0.12); }
  &.disabled { opacity: 0.45; cursor: not-allowed; &:hover { transform: none; box-shadow: none; border-color: var(--border-light); } }
  .action-icon {
    width: 20px; height: 20px; border-radius: 5px; display: flex; align-items: center; justify-content: center;
    color: #fff; flex-shrink: 0; transition: transform 0.2s;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }
  .action-label { font-size: 12.5px; font-weight: 600; color: #1e293b; white-space: nowrap; }
}
.log-head-actions { display: flex; align-items: center; gap: 8px; }
/* 更新日志终端字体缩小 */
.update-page .terminal {
  font-size: 11.5px;
  line-height: 1.5;
  padding: 10px 12px;
}
.global-hint { font-size: 12px; color: #94a3b8; }
.ssl-control { display: flex; align-items: center; gap: 8px; }
.hint { font-size: 12px; color: #909399; white-space: nowrap; }
</style>
