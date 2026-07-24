<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, SetUp } from '@element-plus/icons-vue'
import { appApi, type AppItem, type AppInput, type AppType } from '@/api/app'
import SystemUpdateView from './SystemUpdateView.vue'

const list = ref<AppItem[]>([])
const loading = ref(false)
const templates = ref<Record<string, any>>({})

const updateDrawer = ref(false)
const updateAppId = ref<number | null>(null)
const updateApp = computed(() => list.value.find((a) => a.id === updateAppId.value) || null)

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref<FormInstance>()
const excludesText = ref('')

const form = reactive({
  id: 0,
  name: '',
  display_name: '',
  type: 'nodejs' as AppType,
  scope: 'external' as 'internal' | 'external',
  repo_url: '',
  branch: 'main',
  deploy_path: '',
  pm2_app_name: '',
  port: null as number | null,
  install_cmd: '',
  build_cmd: '',
  build_enabled: false,
  start_file: '',
  interpreter: '',
  process_mode: 'pm2' as 'pm2' | 'custom',
  start_cmd: '',
  stop_cmd: '',
  enabled: true,
  remark: ''
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入应用标识', trigger: 'blur' }]
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [listRes, tplRes] = await Promise.all([appApi.list(), appApi.templates()])
    list.value = listRes.data
    templates.value = tplRes.data as any
  } finally {
    loading.value = false
  }
}

/** 类型变化时套用模板 */
function applyTemplate(): void {
  const tpl = templates.value[form.type]
  if (!tpl) return
  form.install_cmd = tpl.installCmd
  form.build_cmd = tpl.buildCmd
  form.build_enabled = tpl.buildEnabled
  form.start_file = tpl.startFile
  form.interpreter = tpl.interpreter
  form.process_mode = tpl.processMode
  form.start_cmd = tpl.startCmd
  form.stop_cmd = tpl.stopCmd
  if (!excludesText.value) excludesText.value = tpl.deployExcludes
}

function openCreate(): void {
  isEdit.value = false
  Object.assign(form, {
    id: 0, name: '', display_name: '', type: 'nodejs', scope: 'external',
    repo_url: '', branch: 'main', deploy_path: '', pm2_app_name: '', port: null,
    install_cmd: 'npm install', build_cmd: 'npm run build', build_enabled: true,
    start_file: '', interpreter: '', process_mode: 'pm2', start_cmd: '', stop_cmd: '',
    enabled: true, remark: ''
  })
  excludesText.value = templates.value.nodejs?.deployExcludes || ''
  dialogVisible.value = true
}

function openEdit(row: any): void {
  isEdit.value = true
  Object.assign(form, {
    id: row.id, name: row.name, display_name: row.display_name, type: row.type,
    scope: row.scope, repo_url: row.repo_url, branch: row.branch, deploy_path: row.deploy_path,
    pm2_app_name: row.pm2_app_name, port: row.port, install_cmd: row.install_cmd,
    build_cmd: row.build_cmd, build_enabled: row.build_enabled === 1, start_file: row.start_file,
    interpreter: row.interpreter, process_mode: row.process_mode, start_cmd: row.start_cmd,
    stop_cmd: row.stop_cmd, enabled: row.enabled === 1, remark: row.remark || ''
  })
  excludesText.value = row.deploy_excludes || ''
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  await formRef.value?.validate()
  const data: AppInput = {
    name: form.name, display_name: form.display_name, type: form.type, scope: form.scope,
    repo_url: form.repo_url, branch: form.branch, deploy_path: form.deploy_path,
    pm2_app_name: form.pm2_app_name, port: form.port, install_cmd: form.install_cmd,
    build_cmd: form.build_cmd, build_enabled: form.build_enabled, start_file: form.start_file,
    interpreter: form.interpreter, process_mode: form.process_mode, start_cmd: form.start_cmd,
    stop_cmd: form.stop_cmd, deploy_excludes: excludesText.value,
    enabled: form.enabled, remark: form.remark
  }
  if (isEdit.value) {
    await appApi.update(form.id, data)
    ElMessage.success('已更新')
  } else {
    await appApi.create(data)
    ElMessage.success('已创建')
  }
  dialogVisible.value = false
  await load()
}

async function handleToggle(row: any): Promise<void> {
  await appApi.toggle(row.id, row.enabled !== 1)
  await load()
}

async function handleDelete(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除应用「${row.display_name || row.name}」吗？`, '提示', { type: 'warning' })
  } catch { return }
  await appApi.remove(row.id)
  ElMessage.success('已删除')
  await load()
}

function goUpdate(row: any): void {
  updateAppId.value = row.id
  updateDrawer.value = true
}

function typeTag(t: string): { type: any; label: string } {
  if (t === 'python') return { type: 'warning', label: 'Python' }
  if (t === 'java') return { type: 'danger', label: 'Java' }
  return { type: 'success', label: 'Node.js' }
}

function runStatusMeta(s: string): { type: 'success' | 'info' | 'warning' | 'danger' | 'primary'; effect: 'plain' | 'light'; label: string } {
  switch (s) {
    case 'online': return { type: 'success', effect: 'light', label: '运行中' }
    case 'stopped': return { type: 'info', effect: 'plain', label: '已停止' }
    case 'errored': return { type: 'danger', effect: 'light', label: '异常' }
    case 'launching': return { type: 'warning', effect: 'light', label: '启动中' }
    case 'stopping': return { type: 'warning', effect: 'plain', label: '停止中' }
    case 'pm2_missing': return { type: 'info', effect: 'plain', label: 'PM2 未装' }
    default: return { type: 'info', effect: 'plain', label: '未托管' }
  }
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div>
    <h2 class="page-title">应用管理</h2>
    <p class="page-subtitle">注册被管理的系统/服务（支持 Node.js、Python 类型），配置后可对其发布、更新、重启、停止</p>

    <el-card shadow="never" class="panel">
      <div class="toolbar">
        <div class="tip">
          <el-icon><SetUp /></el-icon>
          内部系统（本平台自身）与外部系统均可注册，不同类型使用不同命令模板
        </div>
        <el-button type="primary" :icon="Plus" @click="openCreate">注册应用</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe row-key="id">
        <el-table-column label="应用" min-width="150">
          <template #default="{ row }">
            <div class="app-name">
              <span class="enabled-dot" :class="{ off: row.enabled !== 1 }" :title="row.enabled === 1 ? '已启用' : '已停用'"></span>
              <span class="name">{{ row.display_name || row.name }}</span>
              <span class="code">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="104">
          <template #default="{ row }">
            <div class="tags">
              <el-tag :type="typeTag(row.type).type" size="small">{{ typeTag(row.type).label }}</el-tag>
              <el-tag :type="row.scope === 'internal' ? 'primary' : 'info'" effect="plain" size="small">
                {{ row.scope === 'internal' ? '内' : '外' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="PM2" prop="pm2_app_name" min-width="100" show-overflow-tooltip />
        <el-table-column label="端口" width="68">
          <template #default="{ row }">{{ row.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="运行状态" width="96">
          <template #default="{ row }">
            <el-tag :type="runStatusMeta(row.runStatus).type" :effect="runStatusMeta(row.runStatus).effect" size="small">
              {{ runStatusMeta(row.runStatus).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="216" class-name="op-cell">
          <template #default="{ row }">
            <el-button text type="primary" @click="goUpdate(row)">更新</el-button>
            <el-button text type="info" @click="openEdit(row)">编辑</el-button>
            <el-button text :type="row.enabled === 1 ? 'warning' : 'success'" @click="handleToggle(row)">
              {{ row.enabled === 1 ? '停用' : '启用' }}
            </el-button>
            <el-button text type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑应用' : '注册应用'" width="720px" top="5vh">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-divider content-position="left">基本信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="应用标识" prop="name">
              <el-input v-model="form.name" placeholder="唯一标识，如 user-service" :disabled="isEdit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示名称">
              <el-input v-model="form.display_name" placeholder="中文名" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="应用类型">
              <el-select v-model="form.type" style="width:100%" @change="applyTemplate">
                <el-option label="Node.js" value="nodejs" />
                <el-option label="Python" value="python" />
                <el-option label="Java" value="java" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="范围">
              <el-radio-group v-model="form.scope">
                <el-radio-button value="internal">内部</el-radio-button>
                <el-radio-button value="external">外部</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="启用">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">代码仓库与部署</el-divider>
        <el-row :gutter="16">
          <el-col :span="14">
            <el-form-item label="仓库地址">
              <el-input v-model="form.repo_url" placeholder="https://github.com/owner/repo" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="分支">
              <el-input v-model="form.branch" placeholder="main" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="14">
            <el-form-item label="部署目录">
              <el-input v-model="form.deploy_path" placeholder="留空则使用默认工作目录" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="端口">
              <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" style="width:100%" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">进程管理</el-divider>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="管理方式">
              <el-radio-group v-model="form.process_mode">
                <el-radio-button value="pm2">PM2</el-radio-button>
                <el-radio-button value="custom">自定义命令</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8" v-if="form.process_mode === 'pm2'">
            <el-form-item label="PM2 应用名" prop="pm2_app_name">
              <el-input v-model="form.pm2_app_name" placeholder="pm2 进程名" />
            </el-form-item>
          </el-col>
          <template v-if="form.process_mode === 'pm2' && form.type === 'python'">
            <el-col :span="4">
              <el-form-item label="入口文件">
                <el-input v-model="form.start_file" placeholder="app.py" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="解释器">
                <el-input v-model="form.interpreter" placeholder="python" />
              </el-form-item>
            </el-col>
          </template>
        </el-row>
        <template v-if="form.process_mode === 'custom'">
          <el-alert
            type="warning" :closable="false" show-icon style="margin-bottom:12px"
            title="自定义模式：通过下方命令启停服务（无需 PM2）。启动命令建议后台运行，停止命令用于终止进程。"
          />
          <el-form-item label="启动命令">
            <el-input v-model="form.start_cmd" :placeholder="form.type === 'java' ? 'java -jar target/app.jar' : form.type === 'python' ? 'python app.py' : 'node server.js'" />
          </el-form-item>
          <el-form-item label="停止命令">
            <el-input v-model="form.stop_cmd" placeholder="可选，如 kill $(cat app.pid) 或脚本" />
          </el-form-item>
        </template>

        <el-divider content-position="left">命令配置</el-divider>
        <el-form-item label="安装命令">
          <el-input v-model="form.install_cmd" :placeholder="form.type === 'python' ? 'pip install -r requirements.txt' : form.type === 'java' ? 'mvn clean install -DskipTests' : 'npm install'" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="18">
            <el-form-item label="构建命令">
              <el-input v-model="form.build_cmd" :disabled="!form.build_enabled" :placeholder="form.type === 'python' ? 'Python 通常无需构建' : form.type === 'java' ? 'mvn clean package -DskipTests' : 'npm run build'" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="启用构建">
              <el-switch v-model="form.build_enabled" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="部署排除">
          <el-input v-model="excludesText" type="textarea" :rows="4" placeholder="每行一条 glob 规则" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="应用说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 更新抽屉 -->
    <el-drawer
      v-model="updateDrawer"
      :title="`${updateApp?.display_name || updateApp?.name || ''} · 应用更新`"
      direction="rtl"
      size="780px"
      destroy-on-close
    >
      <SystemUpdateView v-if="updateAppId" :app-id="updateAppId" />
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 13px;
}
.app-name {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  position: relative;
  padding-left: 10px;
  .enabled-dot {
    position: absolute;
    left: 0;
    top: 5px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    &.off {
      background: #cbd5e1;
      box-shadow: 0 0 0 3px rgba(203, 213, 225, 0.2);
    }
  }
  .name { font-weight: 600; color: #1e293b; font-size: 13px; }
  .code { font-size: 12px; color: #94a3b8; font-family: 'Cascadia Code', Consolas, monospace; }
}
.tags {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.repo {
  color: #606266;
  font-size: 12.5px;
}
.muted { color: #c0c4cc; font-size: 12.5px; }
:deep(.op-cell .cell) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  overflow: visible;
}
:deep(.op-cell .el-button + .el-button) {
  margin-left: 0;
}
</style>
