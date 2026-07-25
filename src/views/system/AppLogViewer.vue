<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Refresh, Search, Download } from '@element-plus/icons-vue'
import { appApi, type AppLogResult, type LogSource } from '@/api/app'

const props = defineProps<{
  appId: number
  appName: string
}>()

const visible = defineModel<boolean>({ default: false })

const loading = ref(false)
const result = ref<AppLogResult | null>(null)
const source = ref<string>('')
const lines = ref(500)
const keyword = ref('')
const autoRefresh = ref(false)
const lastUpdate = ref(0)
const logBody = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setInterval> | null = null

const sources = computed<LogSource[]>(() => result.value?.sources ?? [])
const logLines = computed<string[]>(() => result.value?.lines ?? [])
const fileSizeText = computed(() => formatBytes(result.value?.fileSize ?? 0))

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function lineClass(line: string): string {
  const l = line.toLowerCase()
  if (/\b(error|exception|err|failed|failure|fatal|traceback)\b/.test(l)) return 'lvl-error'
  if (/\b(warn|warning)\b/.test(l)) return 'lvl-warn'
  return 'lvl-info'
}

async function load(): Promise<void> {
  if (!props.appId) return
  loading.value = true
  try {
    const params: Record<string, number | string> = { lines: lines.value }
    if (source.value) params.source = source.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const res = await appApi.logs(props.appId, params)
    result.value = res.data
    lastUpdate.value = Date.now()
    if (res.data.source && source.value !== res.data.source) source.value = res.data.source
    await nextTick(scrollToBottomIfNear)
  } finally {
    loading.value = false
  }
}

function handleSearch(): void {
  load()
}

async function handleSourceChange(): Promise<void> {
  await load()
}

function scrollToBottomIfNear(): void {
  const el = logBody.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

function nearBottom(): boolean {
  const el = logBody.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

async function onAutoScroll(): Promise<void> {
  if (autoRefresh.value && nearBottom()) await load()
}

watch(autoRefresh, (on) => {
  if (on) {
    timer = setInterval(load, 5000)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
})

watch(
  () => props.appId,
  async (id) => {
    if (id && visible.value) {
      source.value = ''
      await load()
    }
  }
)

watch(visible, async (open) => {
  if (open && props.appId) {
    source.value = ''
    await load()
  } else if (!open) {
    autoRefresh.value = false
  }
})

function downloadLogs(): void {
  if (!logLines.value.length) return
  const blob = new Blob([logLines.value.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.appName}-${source.value || 'log'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.log`
  a.click()
  URL.revokeObjectURL(url)
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="`${appName} · 运行日志`"
    direction="rtl"
    size="780px"
    destroy-on-close
  >
    <div class="log-viewer">
      <div class="bar">
        <el-radio-group v-if="sources.length" v-model="source" size="small" @change="handleSourceChange">
          <el-radio-button
            v-for="s in sources"
            :key="s.key"
            :value="s.key"
            :disabled="!s.exists"
          >
            {{ s.label }}<span v-if="!s.exists" class="miss">（无）</span>
          </el-radio-button>
        </el-radio-group>
        <span class="fill"></span>
        <el-input-number v-model="lines" :min="100" :max="5000" :step="100" size="small" controls-position="right" style="width:120px" />
        <el-input
          v-model="keyword"
          size="small"
          clearable
          placeholder="关键字过滤"
          style="width:160px"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" :icon="Search" size="small" @click="handleSearch">查询</el-button>
        <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
      </div>

      <div class="meta">
        <template v-if="result?.available">
          <span>共 {{ logLines.length }} 行{{ keyword ? `（匹配）` : '' }}</span>
          <span>文件大小 {{ fileSizeText }}</span>
          <span v-if="result.truncated" class="warn">已截断（仅显示尾部）</span>
        </template>
        <span class="spacer"></span>
        <span class="auto">
          <el-switch v-model="autoRefresh" size="small" /> 自动刷新(5s)
        </span>
        <el-button text type="primary" size="small" :icon="Download" :disabled="!logLines.length" @click="downloadLogs">下载</el-button>
        <span v-if="lastUpdate" class="ts">更新于 {{ new Date(lastUpdate).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
      </div>

      <div v-if="result && !result.available" class="empty">
        <el-empty :description="result.message || '无可用日志'" />
      </div>

      <div
        v-else
        ref="logBody"
        v-loading="loading"
        class="log-body"
        @scroll="onAutoScroll"
      >
        <div v-if="!logLines.length && !loading" class="empty-line">（无日志内容）</div>
        <div
          v-for="(line, idx) in logLines"
          :key="idx"
          class="line"
          :class="lineClass(line)"
        >
          <span class="ln">{{ idx + 1 }}</span>
          <span class="lt">{{ line }}</span>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.log-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 10px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fill { flex: 1; }
.meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: #909399;
  .spacer { flex: 1; }
  .auto { display: inline-flex; align-items: center; gap: 4px; }
  .warn { color: #e6a23c; }
  .ts { color: #c0c4cc; }
}
.log-body {
  flex: 1;
  overflow: auto;
  background: #0f172a;
  border-radius: 6px;
  padding: 8px 0;
  font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.55;
}
.line {
  display: flex;
  white-space: pre;
  padding: 0 12px;
  &:hover { background: rgba(255, 255, 255, 0.04); }
}
.ln {
  flex: 0 0 auto;
  width: 56px;
  text-align: right;
  padding-right: 12px;
  color: #475569;
  user-select: none;
}
.lt { color: #e2e8f0; word-break: break-all; white-space: pre-wrap; }
.lvl-error .lt { color: #f87171; }
.lvl-warn .lt { color: #fbbf24; }
.lvl-info .lt { color: #cbd5e1; }
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-line {
  color: #64748b;
  padding: 24px;
  text-align: center;
}
.miss { color: #ef4444; font-size: 11px; }
</style>
