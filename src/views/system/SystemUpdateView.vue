<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download, Files, Box, Tools, Refresh, SwitchButton,
  RefreshRight, Delete, Connection, Search
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

const route = useRoute()
const apps = ref<AppItem[]>([])
const selectedAppId = ref<number | null>(null)
const selectedApp = computed(() => apps.value.find((a) => a.id === selectedAppId.value) || null)

const state = ref<UpdateState>(emptyState())
const polling = ref<number | null>(null)
const logRef = ref<HTMLDivElement>()

const gconfig = reactive({ githubToken: '', proxy: '', sslVerify: true, packageKeep: 3 })
const showConfig = ref(false)
const testing = ref(false)
const probing = ref(false)
const envInfo = ref<{ shell?: any; packages?: any }>({})

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
  installing: { label: '安装依赖', color: '#f59e0b' },
  building: { label: '构建中', color: '#06b6d4' },
  restarting: { label: '重启中', color: '#10b981' },
  stopping: { label: '停止中', color: '#ef4444' },
  done: { label: '完成', color: '#10b981' },
  error: { label: '失败', color: '#ef4444' }
}

const actions = computed(() => {
  if (!selectedApp.value) return []
  const isPy = selectedApp.value.type === 'python'
  return [
    { mode: 'download', label: '下载', desc: '从仓库拉取源码', icon: Download, color: '#3b82f6' },
    { mode: 'deploy', label: '部署', desc: '部署文件到目录', icon: Files, color: '#3b82f6' },
    { mode: 'install', label: '安装依赖', desc: isPy ? 'pip install' : 'npm install', icon: Box, color: '#f59e0b' },
    { mode: 'build', label: '编译', desc: isPy ? 'Python 通常跳过' : '执行构建', icon: Tools, color: '#06b6d4', disabled: isPy && selectedApp.value.build_enabled !== 1 },
    { mode: 'restart', label: '重启', desc: 'PM2 重启', icon: Refresh, color: '#10b981' },
    { mode: 'stop', label: '停止', desc: 'PM2 停止', icon: SwitchButton, color: '#ef4444', danger: true }
  ]
})

const stageInfo = computed(() => stageMeta[state.value.stage] ?? stageMeta.idle)
const canAct = computed(() => !!selectedApp.value && selectedApp.value.enabled === 1 && !state.value.running)

async function loadStatus(): Promise<void> {
  const res = await updateApi.status()
  const wasRunning = state.value.running
  state.value = res.data
  if (wasRunning && !res.data.running) {
    if (res.data.stage === 'done') ElMessage.success(`[${res.data.appName}] 任务执行完成`)
    else if (res.data.stage === 'error') ElMessage.error(res.data.error || '任务失败')
    stopPolling()
  }
  await scrollLog()
}

async function loadApps(): Promise<void> {
  const res = await appApi.list()
  apps.value = res.data
  // 路由指定 appId 或选中第一个启用的
  const qId = Number(route.query.appId)
  if (qId && apps.value.some((a) => a.id === qId)) {
    selectedAppId.value = qId
  } else if (!selectedAppId.value && apps.value.length) {
    selectedAppId.value = (apps.value.find((a) => a.enabled === 1) || apps.value[0]).id
  }
}

async function loadConfig(): Promise<void> {
  const res = await updateApi.config()
  Object.assign(gconfig, res.data)
}

async function loadEnv(): Promise<void> {
  const res = await updateApi.env(selectedApp.value?.name)
  envInfo.value = res.data
}

watch(selectedAppId, () => { loadEnv() })

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
  full: '一键更新（下载→部署→安装→构建→重启）',
  download: '下载源码', deploy: '部署文件', install: '安装依赖',
  build: '编译构建', restart: '重启服务', stop: '停止服务'
}

async function run(mode: string): Promise<void> {
  if (!selectedApp.value) { ElMessage.warning('请先选择目标应用'); return }
  const text = modeTextMap[mode]
  const danger = mode === 'stop' || mode === 'full' || mode === 'restart'
  try {
    await ElMessageBox.confirm(
      `确定对应用「${selectedApp.value.display_name || selectedApp.value.name}」执行「${text}」吗？${danger ? '服务可能会短暂中断。' : ''}`,
      '操作确认',
      { type: danger ? 'error' : 'warning', confirmButtonText: '确定执行', cancelButtonText: '取消' }
    )
  } catch { return }
  await appApi.run(selectedApp.value.id, mode)
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
    <h2 class="page-title">应用更新</h2>
    <p class="page-subtitle">选择目标应用，执行下载→部署→安装→构建→重启/停止的完整运维流程</p>

    <!-- 应用选择 -->
    <el-card shadow="never" class="panel app-panel">
      <div class="app-bar">
        <div class="app-bar-left">
          <div class="bar-label">目标应用</div>
          <el-select v-model="selectedAppId" placeholder="选择要管理的应用" class="app-select-box">
            <el-option v-for="a in apps" :key="a.id" :value="a.id" :label="a.display_name || a.name" :disabled="a.enabled !== 1">
              <span style="float:left">{{ a.display_name || a.name }}</span>
              <span style="float:right;color:#909399;font-size:12px">{{ a.type === 'python' ? 'Python' : 'Node.js' }}</span>
            </el-option>
          </el-select>
        </div>
        <div v-if="selectedApp" class="app-bar-info">
          <div class="info-tags">
            <el-tag size="small" :type="selectedApp.type === 'python' ? 'warning' : 'success'">
              {{ selectedApp.type === 'python' ? 'Python' : 'Node.js' }}
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
          </div>
        </div>
      </div>
    </el-card>

    <!-- 执行控制 -->
    <el-card shadow="never" class="panel" v-if="selectedApp">
      <div class="status-banner" :style="{ '--stage-color': stageInfo.color }">
        <span class="status-dot" :style="{ background: stageInfo.color }">
          <span v-if="state.running" class="pulse"></span>
        </span>
        <div class="status-main">
          <div class="status-stage">{{ stageInfo.label }}<span v-if="state.appName" class="run-app"> · {{ state.appName }}</span></div>
          <div class="status-msg">{{ state.message }}</div>
        </div>
        <div class="status-progress" v-if="state.running || state.progress > 0">
          <el-progress :percentage="state.progress" :color="stageInfo.color" :stroke-width="6" :show-text="false" />
          <span class="progress-text">{{ state.progress }}% · {{ fmtTime(state.startedAt) }} → {{ fmtTime(state.finishedAt) }}</span>
        </div>
      </div>

      <div class="hero-action">
        <el-button type="primary" class="full-btn" :loading="state.running" :disabled="!canAct" @click="runFull">
          <el-icon style="margin-right:5px"><RefreshRight /></el-icon>一键更新
        </el-button>
        <div class="hero-hint">完整执行：下载 → 部署 → 安装 → 构建 → 重启</div>
      </div>

      <div class="action-grid">
        <div
          v-for="a in actions"
          :key="a.mode"
          class="action-card"
          :class="{ danger: a.danger, disabled: a.disabled || !canAct }"
          @click="(!a.disabled && canAct) ? run(a.mode) : null"
        >
          <div class="action-icon" :style="{ background: a.color }">
            <el-icon :size="15"><component :is="a.icon" /></el-icon>
          </div>
          <div class="action-text">
            <div class="action-label">{{ a.label }}</div>
          </div>
        </div>
      </div>

      <div class="control-foot">
        <el-button :icon="Refresh" @click="loadStatus">刷新状态</el-button>
        <el-button :icon="Delete" @click="clearLogs">清空日志</el-button>
      </div>
    </el-card>

    <el-empty v-else description="请先在「应用管理」注册并选择一个应用" />

    <!-- 更新日志 -->
    <el-card v-if="selectedApp" shadow="never" class="panel">
      <template #header>
        <div class="panel-head">
          <span class="panel-title">更新日志</span>
          <el-tag size="small" effect="plain">共 {{ state.logs.length }} 条</el-tag>
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
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="HTTP/HTTPS 代理">
                  <el-input v-model="gconfig.proxy" placeholder="http://127.0.0.1:7890，留空直连" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="SSL 证书校验">
                  <el-switch v-model="gconfig.sslVerify" />
                  <span class="hint">{{ gconfig.sslVerify ? '严格校验' : '跳过(内网/自签证书)' }}</span>
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="部署包保留">
                  <el-input-number v-model="gconfig.packageKeep" :min="1" :max="20" controls-position="right" style="width:100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item>
              <el-button :icon="Connection" :loading="testing" @click="testGithub">测试当前应用连接</el-button>
              <el-button :icon="Search" :loading="probing" @click="probeProxy">探测本地代理</el-button>
              <el-button type="primary" @click="handleSaveConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </el-card>

    <el-card v-if="selectedApp" shadow="never" class="panel">
      <template #header><span class="panel-title">{{ selectedApp.name }} 部署包</span></template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="操作系统">{{ envInfo.shell?.os }}</el-descriptions-item>
        <el-descriptions-item label="Shell">{{ envInfo.shell?.shell }}</el-descriptions-item>
        <el-descriptions-item label="部署目录">{{ envInfo.packages?.dir }}</el-descriptions-item>
        <el-descriptions-item label="部署包数量">{{ envInfo.packages?.count }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-weight: 600; }

/* 应用选择卡 */
.app-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.app-bar-left {
  display: flex;
  flex-direction: column;
  gap: 5px;
  .bar-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
  }
  .app-select-box { width: 240px; }
}
.app-bar-info {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 24px;
  border-left: 1px solid var(--border-light);
  .info-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .info-meta { display: flex; gap: 22px; flex-wrap: wrap; }
  .meta-item { display: flex; align-items: baseline; gap: 6px; }
  .meta-k {
    font-size: 11px;
    color: #94a3b8;
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 4px;
  }
  .meta-v { font-size: 13px; color: #475569; }
  .repo-v { font-family: 'Cascadia Code', Consolas, monospace; font-size: 12px; color: #64748b; }
}

/* 状态横幅 */
.status-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--stage-color) 10%, transparent), color-mix(in srgb, var(--stage-color) 4%, transparent));
  border: 1px solid color-mix(in srgb, var(--stage-color) 22%, transparent);
  .status-dot {
    width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; position: relative;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--stage-color) 18%, transparent);
    .pulse { position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: pulse 1.4s ease-out infinite; }
  }
  .status-main { flex-shrink: 0; }
  .status-stage { font-size: 15px; font-weight: 600; color: #1e293b; }
  .run-app { color: #94a3b8; font-weight: 400; font-size: 12px; }
  .status-msg { font-size: 12px; color: #64748b; margin-top: 2px; }
  .status-progress { flex: 1; max-width: 340px; margin-left: auto; .progress-text { font-size: 11px; color: #94a3b8; display: block; margin-top: 3px; text-align: right; } }
}
@keyframes pulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.4); opacity: 0; } }

/* 一键更新 */
.hero-action {
  text-align: center;
  margin-bottom: 14px;
  .full-btn {
    height: 44px; padding: 0 40px; font-size: 15px; font-weight: 600; letter-spacing: 1px;
    border: none; background: var(--brand-grad);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
    &:hover { box-shadow: 0 8px 22px rgba(37, 99, 235, 0.4); transform: translateY(-1px); }
    &:disabled { box-shadow: none; }
  }
  .hero-hint { margin-top: 8px; font-size: 12px; color: #c0c4cc; }
}

/* 操作卡 */
.action-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.action-card {
  display: flex; align-items: center; gap: 8px; padding: 9px 11px;
  border: 1px solid var(--border-light); border-radius: 9px; cursor: pointer; transition: all 0.2s;
  background: #fff;
  &:hover { border-color: var(--brand-1); transform: translateY(-2px); box-shadow: 0 6px 14px rgba(37, 99, 235, 0.14); }
  &:hover .action-icon { transform: scale(1.08); }
  &.danger:hover { border-color: #ef4444; box-shadow: 0 6px 14px rgba(239, 68, 68, 0.14); }
  &.disabled { opacity: 0.45; cursor: not-allowed; &:hover { transform: none; box-shadow: none; border-color: var(--border-light); } }
  .action-icon {
    width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    color: #fff; flex-shrink: 0; transition: transform 0.2s;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .action-label { font-size: 13px; font-weight: 600; color: #1e293b; }
}
.control-foot { margin-top: 14px; display: flex; gap: 8px; }
.hint { margin-left: 8px; font-size: 12px; color: #909399; }
</style>
