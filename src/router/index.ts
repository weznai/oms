import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' }
    },
    {
      path: '/',
      component: () => import('@/layout/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/system/DashboardView.vue'),
          meta: { title: '仪表盘', icon: 'Odometer' }
        },
        {
          path: 'system-update',
          name: 'system-update',
          component: () => import('@/views/system/SystemUpdateView.vue'),
          meta: { title: '应用更新', icon: 'Refresh' }
        },
        {
          path: 'apps',
          name: 'apps',
          component: () => import('@/views/system/AppManageView.vue'),
          meta: { title: '应用管理', icon: 'Grid' }
        },
        {
          path: 'system-manage',
          name: 'system-manage',
          component: () => import('@/views/system/SystemManageView.vue'),
          meta: { title: '系统管理', icon: 'Coin' }
        },
        {
          path: 'logs',
          name: 'logs',
          component: () => import('@/views/system/LogsView.vue'),
          meta: { title: '操作日志', icon: 'Document' }
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
          meta: { title: '个人中心', icon: 'User' }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard'
    }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.token) {
    return { name: 'dashboard' }
  }
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || ''
  document.title = title ? `${title} - 运营管理平台` : '运营管理平台'
})

export default router
