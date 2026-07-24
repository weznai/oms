<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { authApi, type AdminProfile } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const profile = ref<AdminProfile | null>(null)
const loading = ref(false)
const submitting = ref(false)

const formRef = ref<FormInstance>()
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_r, val, cb) => {
        if (val !== form.newPassword) cb(new Error('两次输入不一致'))
        else cb()
      },
      trigger: 'blur'
    }
  ]
}

async function loadProfile(): Promise<void> {
  loading.value = true
  try {
    const res = await authApi.profile()
    profile.value = res.data
  } finally {
    loading.value = false
  }
}

async function handleSubmit(): Promise<void> {
  await formRef.value?.validate()
  submitting.value = true
  try {
    await authApi.changePassword(form.oldPassword, form.newPassword)
    ElMessage.success('密码修改成功')
    formRef.value?.resetFields()
  } finally {
    submitting.value = false
  }
}

function fmtTime(t: number | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

const roleLabel = (r: string): string => (r === 'super_admin' ? '管理员' : '管理员')

onMounted(loadProfile)
</script>

<template>
  <div v-loading="loading">
    <h2 class="page-title">个人中心</h2>
    <p class="page-subtitle">查看账号信息与修改登录密码</p>

    <el-row :gutter="20">
      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">账号信息</span></template>
          <div class="profile-card">
            <el-avatar :size="72" class="profile-avatar">
              {{ auth.admin?.displayName?.charAt(0) || 'A' }}
            </el-avatar>
            <div class="profile-name">{{ profile?.displayName || auth.admin?.username }}</div>
            <el-tag type="primary" effect="plain" size="small">
              {{ roleLabel(profile?.role || 'admin') }}
            </el-tag>
          </div>
          <el-descriptions :column="1" border size="small" style="margin-top: 20px">
            <el-descriptions-item label="用户名">
              <el-icon><User /></el-icon> {{ profile?.username }}
            </el-descriptions-item>
            <el-descriptions-item label="最近登录">{{ fmtTime(profile?.lastLoginAt ?? null) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">修改密码</span></template>
          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="100px"
            style="max-width: 460px; margin-top: 10px"
          >
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="form.oldPassword" type="password" :prefix-icon="Lock" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="form.newPassword" type="password" :prefix-icon="Lock" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="form.confirmPassword" type="password" :prefix-icon="Lock" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="handleSubmit">确认修改</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.panel-title { font-weight: 600; }

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px 0;

  .profile-avatar {
    background: var(--brand-grad);
    color: #fff;
    font-size: 28px;
    font-weight: 600;
  }
  .profile-name {
    font-size: 18px;
    font-weight: 600;
  }
}
</style>
