<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: 'admin', password: 'admin123' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin(): Promise<void> {
  await formRef.value?.validate()
  loading.value = true
  try {
    const res = await authApi.login(form.username, form.password)
    auth.setAuth(res.data.token, res.data.admin)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="bg-deco">
      <div class="circle c1"></div>
      <div class="circle c2"></div>
      <div class="circle c3"></div>
    </div>

    <div class="login-card">
      <div class="brand">
        <div class="brand-icon">
          <el-icon :size="28"><Setting /></el-icon>
        </div>
        <h1 class="brand-title">运营管理平台</h1>
        <p class="brand-sub">Ops Management Platform · 系统管理</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-button
          type="primary"
          class="submit-btn"
          :loading="loading"
          @click="handleLogin"
        >
          登 录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
  position: relative;
  overflow: hidden;
}

.bg-deco {
  position: absolute;
  inset: 0;
  .circle {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    filter: blur(2px);
  }
  .c1 {
    width: 360px;
    height: 360px;
    top: -120px;
    left: -80px;
  }
  .c2 {
    width: 260px;
    height: 260px;
    bottom: -60px;
    right: 10%;
  }
  .c3 {
    width: 180px;
    height: 180px;
    top: 30%;
    right: 20%;
    background: rgba(255, 255, 255, 0.06);
  }
}

.login-card {
  width: 400px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 18px;
  padding: 44px 40px 36px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  z-index: 1;
}

.brand {
  text-align: center;
  margin-bottom: 32px;

  .brand-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    border-radius: 16px;
    background: var(--brand-grad);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
  }

  .brand-title {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 6px;
    color: #1e293b;
  }

  .brand-sub {
    font-size: 13px;
    color: #94a3b8;
    margin: 0;
    letter-spacing: 0.5px;
  }
}

.submit-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  background: var(--brand-grad);
  letter-spacing: 4px;

  &:hover {
    opacity: 0.92;
  }
}
</style>
