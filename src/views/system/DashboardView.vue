<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Cpu, Monitor, Coin, Timer } from '@element-plus/icons-vue'
import { systemApi } from '@/api/system'

interface SystemInfo {
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
  totalMemText: string
  freeMemText: string
  usedMemText: string
  uptimeText: string
  processUptimeText: string
}

const info = ref<SystemInfo | null>(null)
const loading = ref(false)
let timer: number | null = null

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await systemApi.info()
    info.value = res.data
  } finally {
    loading.value = false
  }
}

function platformLabel(p: string): string {
  const map: Record<string, string> = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' }
  return map[p] ?? p
}

const memColor = (p: number): string => (p > 85 ? '#ef4444' : p > 65 ? '#f59e0b' : '#10b981')

onMounted(() => {
  load()
  timer = window.setInterval(load, 30000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <h2 class="page-title">仪表盘</h2>
    <p class="page-subtitle">实时系统资源与服务运行状态监控</p>

    <!-- 顶部信息卡 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #2563eb, #3b82f6)">
          <el-icon :size="24"><Monitor /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-label">主机名</div>
          <div class="stat-value">{{ info?.hostname || '-' }}</div>
          <div class="stat-extra">{{ platformLabel(info?.platform ?? '') }} · {{ info?.arch }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669)">
          <el-icon :size="24"><Coin /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-label">数据库</div>
          <div class="stat-value">{{ info?.dbType?.toUpperCase() || '-' }}</div>
          <div class="stat-extra">{{ info?.gitBranch ? `git: ${info.gitBranch}` : '无 git 信息' }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706)">
          <el-icon :size="24"><Timer /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-label">系统运行时长</div>
          <div class="stat-value small">{{ info?.uptimeText || '-' }}</div>
          <div class="stat-extra">进程 PID {{ info?.processPid }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2)">
          <el-icon :size="24"><Cpu /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-label">CPU 核心</div>
          <div class="stat-value">{{ info?.cpus ?? '-' }}</div>
          <div class="stat-extra">Node {{ info?.nodeVersion }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="20" v-if="info">
      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">内存使用</span>
          </template>
          <div class="mem-overview">
            <el-progress
              type="dashboard"
              :percentage="info.memUsagePercent"
              :color="memColor(info.memUsagePercent)"
              :width="160"
            >
              <template #default>
                <div class="mem-percent">{{ info.memUsagePercent }}%</div>
                <div class="mem-percent-label">已使用</div>
              </template>
            </el-progress>
            <div class="mem-detail">
              <div class="mem-row">
                <span class="mem-dot total"></span> 总内存
                <strong>{{ info.totalMemText }}</strong>
              </div>
              <div class="mem-row">
                <span class="mem-dot used"></span> 已使用
                <strong>{{ info.usedMemText }}</strong>
              </div>
              <div class="mem-row">
                <span class="mem-dot free"></span> 空闲
                <strong>{{ info.freeMemText }}</strong>
              </div>
              <div class="mem-row">
                进程占用 <strong>{{ info.processMemMb }} MB</strong>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">系统详情</span>
          </template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="平台名称">{{ info.platformName }}</el-descriptions-item>
            <el-descriptions-item label="当前版本">{{ info.platformVersion }}</el-descriptions-item>
            <el-descriptions-item label="操作系统">
              {{ platformLabel(info.platform) }} {{ info.osRelease }}
            </el-descriptions-item>
            <el-descriptions-item label="CPU 型号">{{ info.cpuModel }}</el-descriptions-item>
            <el-descriptions-item label="负载均衡">
              {{ info.loadAvg.map((n) => n.toFixed(2)).join(' / ') }}
            </el-descriptions-item>
            <el-descriptions-item label="进程运行">{{ info.processUptimeText }}</el-descriptions-item>
            <el-descriptions-item label="Git 提交">
              <el-tag size="small" type="info" v-if="info.gitCommit">{{ info.gitCommit }}</el-tag>
              <span v-else>-</span>
            </el-descriptions-item>
            <el-descriptions-item label="环境工具">
              <el-tag size="small" :type="info.pm2Available ? 'success' : 'info'" effect="plain">
                PM2 {{ info.pm2Available ? '已安装' : '未安装' }}
              </el-tag>
              <el-tag size="small" :type="info.gitAvailable ? 'success' : 'info'" effect="plain" style="margin-left:6px">
                Git {{ info.gitAvailable ? '已安装' : '未安装' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .stat-label {
    font-size: 12px;
    color: #909399;
  }
  .stat-value {
    font-size: 17px;
    font-weight: 700;
    color: #1e293b;
    margin: 2px 0;
    &.small {
      font-size: 15px;
    }
  }
  .stat-extra {
    font-size: 12px;
    color: #c0c4cc;
  }
}

.panel-title {
  font-weight: 600;
}

.mem-overview {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 4px 0;

  .mem-percent {
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
  }
  .mem-percent-label {
    font-size: 12px;
    color: #909399;
  }

  .mem-detail {
    flex: 1;
  }
  .mem-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 14px;
    color: #606266;
    border-bottom: 1px dashed var(--border-light);
    strong {
      margin-left: auto;
      color: #1e293b;
    }
  }
  .mem-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    &.total { background: #2563eb; }
    &.used { background: #ef4444; }
    &.free { background: #10b981; }
  }
}
</style>
