<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import { paramApi, type ParamItem } from '@/api/param'

const list = ref<ParamItem[]>([])
const loading = ref(false)
const keyword = ref('')

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ id: 0, key: '', value: '', remark: '' })

const filtered = () =>
  list.value.filter(
    (p) =>
      p.key.toLowerCase().includes(keyword.value.toLowerCase()) ||
      (p.remark || '').toLowerCase().includes(keyword.value.toLowerCase())
  )

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await paramApi.list()
    list.value = res.data
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  isEdit.value = false
  Object.assign(form, { id: 0, key: '', value: '', remark: '' })
  dialogVisible.value = true
}

function openEdit(row: ParamItem): void {
  isEdit.value = true
  Object.assign(form, { id: row.id, key: row.key, value: row.value, remark: row.remark || '' })
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  if (!form.key.trim()) {
    ElMessage.warning('key 不能为空')
    return
  }
  await paramApi.save({ key: form.key.trim(), value: form.value, remark: form.remark })
  ElMessage.success(isEdit.value ? '已更新' : '已新增')
  dialogVisible.value = false
  await load()
}

async function handleDelete(row: ParamItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除参数「${row.key}」吗？`, '提示', { type: 'warning' })
  } catch { return }
  await paramApi.remove(row.key)
  ElMessage.success('已删除')
  await load()
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div>
    <h2 class="page-title">系统参数</h2>
    <p class="page-subtitle">维护平台运行所需的键值对配置（key / value）</p>

    <el-card shadow="never" class="panel">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索 key 或备注"
          :prefix-icon="Search"
          clearable
          style="width: 260px"
        />
        <el-button type="primary" :icon="Plus" @click="openCreate">新增参数</el-button>
      </div>

      <el-table v-loading="loading" :data="filtered()" stripe row-key="key">
        <el-table-column label="Key" prop="key" min-width="180">
          <template #default="{ row }">
            <el-tag type="info" effect="plain">{{ row.key }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Value" prop="value" min-width="220" show-overflow-tooltip />
        <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ fmtTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" class-name="op-cell">
          <template #default="{ row }">
            <el-button text type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑参数' : '新增参数'"
      width="500px"
    >
      <el-form ref="formRef" :model="form" label-width="80px">
        <el-form-item label="Key" required>
          <el-input v-model="form.key" :disabled="isEdit" placeholder="唯一标识，如 platform_name" />
        </el-form-item>
        <el-form-item label="Value">
          <el-input v-model="form.value" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="参数说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
:deep(.op-cell .cell) {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: visible;
}
:deep(.op-cell .el-button + .el-button) {
  margin-left: 0;
}
</style>
