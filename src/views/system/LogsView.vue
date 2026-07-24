<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import { logApi } from '@/api/log'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const query = reactive({
  page: 1,
  pageSize: 20,
  action: '',
  username: '',
  dateRange: [] as string[]
})

const actionOptions = [
  'login', 'logout', 'change_password', 'system_update', 'update_config',
  'clear_logs', 'db_switch', 'db_sync', 'param_save', 'param_delete'
]

async function load(): Promise<void> {
  loading.value = true
  try {
    const params: any = { page: query.page, pageSize: query.pageSize }
    if (query.action) params.action = query.action
    if (query.username) params.username = query.username
    if (query.dateRange?.length === 2) {
      params.startDate = new Date(query.dateRange[0]).getTime()
      params.endDate = new Date(query.dateRange[1]).getTime()
    }
    const res = await logApi.list(params)
    list.value = res.data.list
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function handleSearch(): void {
  query.page = 1
  load()
}

function handleReset(): void {
  query.action = ''
  query.username = ''
  query.dateRange = []
  handleSearch()
}

function actionTag(action: string): string {
  if (action.includes('delete')) return 'danger'
  if (action.includes('update') || action.includes('sync') || action.includes('switch')) return 'warning'
  if (action === 'login') return 'success'
  return 'info'
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div>
    <h2 class="page-title">操作日志</h2>
    <p class="page-subtitle">管理员操作审计流水，记录登录、系统更新、数据变更等关键行为</p>

    <el-card shadow="never" class="panel">
      <div class="filter-bar">
        <el-select v-model="query.action" placeholder="操作类型" clearable style="width:160px">
          <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
        </el-select>
        <el-input v-model="query.username" placeholder="用户名" clearable style="width:160px" />
        <el-date-picker
          v-model="query.dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 380px"
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="用户" prop="username" width="120" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-tag :type="actionTag(row.action)" size="small">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="IP" prop="ip" width="140" />
        <el-table-column label="描述" prop="description" min-width="220" show-overflow-tooltip />
        <el-table-column label="详情" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="extra">{{ row.extra || '-' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.extra {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  color: #909399;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
