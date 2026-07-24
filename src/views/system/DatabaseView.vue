<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, DataAnalysis } from '@element-plus/icons-vue'
import { dbApi } from '@/api/db'

const status = ref<{ type: string; tableCount: number; tables: string[] } | null>(null)
const loading = ref(false)
const syncing = ref(false)
const switching = ref(false)
const selectedType = ref<'sqlite' | 'mysql'>('sqlite')
const activeTable = ref('')
const tableDetail = ref<{ columns: any[]; rowCount: number } | null>(null)
const syncLogs = ref<{ list: any[]; total: number }>({ list: [], total: 0 })
const logPage = ref(1)

async function loadStatus(): Promise<void> {
  loading.value = true
  try {
    const res = await dbApi.status()
    status.value = res.data
    selectedType.value = res.data.type
  } finally {
    loading.value = false
  }
}

async function loadSyncLogs(): Promise<void> {
  const res = await dbApi.syncLogs(logPage.value, 10)
  syncLogs.value = res.data
}

async function handleSwitch(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定切换数据库到 ${selectedType.value.toUpperCase()}？切换后将重新初始化表结构。`,
      '切换确认',
      { type: 'warning' }
    )
  } catch { return }
  switching.value = true
  try {
    await dbApi.switch(selectedType.value)
    ElMessage.success('切换成功')
    await loadStatus()
  } finally {
    switching.value = false
  }
}

async function handleSync(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将从 MySQL 全量同步数据到本地 SQLite（覆盖现有数据）。确认继续？',
      '同步确认',
      { type: 'warning' }
    )
  } catch { return }
  syncing.value = true
  try {
    const res = await dbApi.syncMysqlToSqlite()
    ElMessage.success(res.data.message)
    await loadSyncLogs()
    await loadStatus()
  } catch (e: any) {
    // 错误已由拦截器提示
  } finally {
    syncing.value = false
  }
}

async function viewTable(name: string): Promise<void> {
  activeTable.value = name
  const res = await dbApi.tableDetail(name)
  tableDetail.value = res.data
}

function statusTag(type: string): string {
  const map: Record<string, string> = { success: 'success', partial: 'warning', failed: 'danger' }
  return map[type] || 'info'
}

onMounted(() => {
  loadStatus()
  loadSyncLogs()
})
</script>

<template>
  <div v-loading="loading">
    <h2 class="page-title">数据库管理</h2>
    <p class="page-subtitle">数据库类型切换、MySQL 同步到本地 SQLite、表结构浏览</p>

    <el-row :gutter="20">
      <!-- 当前状态 + 切换 -->
      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">当前数据库</span></template>
          <div class="db-status">
            <div class="db-type-badge" :class="status?.type">
              <el-icon :size="30"><DataAnalysis /></el-icon>
              <div>
                <div class="db-type-name">{{ status?.type?.toUpperCase() || '-' }}</div>
                <div class="db-type-meta">{{ status?.tableCount ?? 0 }} 张表</div>
              </div>
            </div>
            <div class="db-switch">
              <span class="switch-label">切换到：</span>
              <el-radio-group v-model="selectedType">
                <el-radio-button value="sqlite">SQLite</el-radio-button>
                <el-radio-button value="mysql">MySQL</el-radio-button>
              </el-radio-group>
              <el-button
                type="primary"
                :loading="switching"
                :disabled="selectedType === status?.type"
                @click="handleSwitch"
              >
                执行切换
              </el-button>
            </div>
          </div>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="说明：SQLite 为默认/优先数据库（零配置、本地文件）；MySQL 用于多实例/高并发场景。可通过 .env 的 DB_TYPE 设置启动默认类型。"
            style="margin-top: 16px"
          />
        </el-card>

        <!-- 同步 -->
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">MySQL → SQLite 同步</span></template>
          <div class="sync-box">
            <div class="sync-desc">
              将 MySQL 中的业务表结构和数据全量同步到本地 SQLite 文件，便于离线使用或备份。
            </div>
            <el-button
              type="primary"
              :icon="Download"
              :loading="syncing"
              size="large"
              @click="handleSync"
            >
              开始同步
            </el-button>
          </div>

          <el-divider />

          <div class="sync-log-title">同步记录</div>
          <el-table :data="syncLogs.list" size="small" stripe>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">
                {{ new Date(row.created_at).toLocaleString('zh-CN', { hour12: false }) }}
              </template>
            </el-table-column>
            <el-table-column label="方向" width="150">
              <template #default="{ row }">{{ row.source_type }} → {{ row.target_type }}</template>
            </el-table-column>
            <el-table-column label="表数量" width="80">
              <template #default="{ row }">{{ row.tables ? row.tables.split(',').length : 0 }}</template>
            </el-table-column>
            <el-table-column label="耗时" width="90">
              <template #default="{ row }">{{ row.duration_ms }}ms</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 表列表 + 详情 -->
      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">数据表</span>
              <el-button text :icon="Refresh" @click="loadStatus">刷新</el-button>
            </div>
          </template>
          <div class="table-list">
            <div
              v-for="t in status?.tables"
              :key="t"
              class="table-item"
              :class="{ active: activeTable === t }"
              @click="viewTable(t)"
            >
              <el-icon><Coin /></el-icon>
              <span>{{ t }}</span>
            </div>
          </div>
        </el-card>

        <el-card v-if="tableDetail" shadow="never" class="panel">
          <template #header>
            <span class="panel-title">表结构：{{ activeTable }}</span>
          </template>
          <el-tag type="info" size="small" style="margin-bottom:10px">
            共 {{ tableDetail.rowCount }} 行
          </el-tag>
          <el-table :data="tableDetail.columns" size="small" border max-height="320">
            <el-table-column
              v-for="col in Object.keys(tableDetail.columns[0] || {})"
              :key="col"
              :prop="col"
              :label="col"
              show-overflow-tooltip
            />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title { font-weight: 600; }

.db-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  .db-type-badge {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 24px;
    border-radius: 12px;
    color: #fff;
    background: linear-gradient(135deg, #10b981, #059669);

    &.mysql {
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }
    .db-type-name { font-size: 22px; font-weight: 700; }
    .db-type-meta { font-size: 13px; opacity: 0.9; }
  }

  .db-switch {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    .switch-label { font-size: 13px; color: #909399; }
  }
}

.sync-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  .sync-desc { color: #606266; font-size: 14px; max-width: 460px; }
}
.sync-log-title {
  font-weight: 600;
  margin-bottom: 10px;
}

.table-list {
  max-height: 380px;
  overflow-y: auto;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #606266;
  transition: all 0.2s;
  &:hover { background: #f5f7fa; color: var(--brand-1); }
  &.active { background: rgba(99, 102, 241, 0.1); color: var(--brand-1); font-weight: 600; }
}
</style>
