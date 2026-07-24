<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  Odometer, Refresh, Coin, Setting, Document, User, Grid,
  Fold, Expand, SwitchButton, HomeFilled
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapse = ref(false)

// 进入主页时刷新账号信息（同步显示名等变更，无需重新登录）
onMounted(async () => {
  try {
    const res = await authApi.profile()
    auth.setAuth(auth.token, res.data)
  } catch { /* token 失效由拦截器处理 */ }
})

const iconMap: Record<string, any> = {
  Odometer, Refresh, Coin, Setting, Document, User, Grid
}

const menus = computed(() =>
  router.options.routes
    .flatMap((r) => (r.children ?? []).map((c) => ({ ...c, base: r.path })))
    .filter((c) => c.meta?.title && c.meta?.icon && c.name !== 'profile')
    .map((c) => ({
      name: c.name as string,
      title: c.meta!.title as string,
      icon: c.meta!.icon as string,
      path: c.base.endsWith('/') ? `${c.base}${c.path}` : `${c.base}/${c.path}`
    }))
)

const activeMenu = computed(() => route.path)

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
    await authApi.logout().catch(() => {})
    auth.logout()
    router.push({ name: 'login' })
  } catch { /* 取消 */ }
}
</script>

<template>
  <el-container class="layout">
    <!-- 侧边栏 -->
    <el-aside :width="collapse ? '64px' : '220px'" class="aside">
      <div class="logo">
        <div class="logo-icon">
          <el-icon :size="22"><HomeFilled /></el-icon>
        </div>
        <transition name="fade">
          <span v-show="!collapse" class="logo-text">运营管理平台</span>
        </transition>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="collapse"
        :collapse-transition="false"
        router
        class="menu"
      >
        <el-menu-item v-for="m in menus" :key="m.name" :index="m.path">
          <el-icon><component :is="iconMap[m.icon]" /></el-icon>
          <template #title>{{ m.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-button text class="collapse-btn" @click="collapse = !collapse">
            <el-icon :size="20">
              <component :is="collapse ? Expand : Fold" />
            </el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>系统管理</el-breadcrumb-item>
            <el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click">
            <div class="user">
              <el-avatar :size="26" class="avatar">
                {{ auth.admin?.displayName?.charAt(0) || 'A' }}
              </el-avatar>
              <span class="username">{{ auth.admin?.displayName || auth.admin?.username }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="User" @click="router.push({ name: 'profile' })">
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item :icon="SwitchButton" divided @click="handleLogout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.layout {
  height: 100vh;
}

.aside {
  background: #fff;
  border-right: 1px solid var(--border-light);
  transition: width 0.25s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: #1e293b;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);

  .logo-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--brand-grad);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #fff;
  }

  .logo-text {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    color: #1e293b;
  }
}

.menu {
  background: transparent;
  border-right: none;
  flex: 1;
  padding-top: 8px;

  :deep(.el-menu-item) {
    color: #475569;
    height: 42px;
    line-height: 42px;
    margin: 2px 8px;
    border-radius: 8px;
    font-size: 14px;

    &:hover {
      color: var(--brand-1);
      background: #f1f5f9;
    }
    &.is-active {
      color: var(--brand-1);
      background: rgba(99, 102, 241, 0.1);
      font-weight: 600;
      position: relative;
      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 3px;
        height: 18px;
        border-radius: 0 3px 3px 0;
        background: var(--brand-grad);
      }
    }
  }
}

.header {
  height: 52px;
  background: #fff;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .collapse-btn {
    padding: 6px;
  }

  .header-right .user {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.2s;

    &:hover {
      background: #f5f7fa;
    }

    .avatar {
      background: var(--brand-grad);
      color: #fff;
      font-weight: 600;
      font-size: 12px;
    }
    .username {
      font-size: 13px;
      color: #303133;
    }
  }
}

.main {
  padding: 14px 16px;
  overflow-y: auto;
  background: var(--bg-page);
}
</style>
