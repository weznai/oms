<script setup lang="ts">
import { ref } from 'vue'
import DatabaseView from './DatabaseView.vue'
import ParamsView from './ParamsView.vue'

const activeTab = ref('database')
</script>

<template>
  <div class="system-manage">
    <h2 class="page-title">系统管理</h2>
    <p class="page-subtitle">数据库切换、MySQL 同步、表结构浏览与系统参数维护</p>

    <el-tabs v-model="activeTab" class="mg-tabs">
      <el-tab-pane label="数据库管理" name="database">
        <DatabaseView />
      </el-tab-pane>
      <el-tab-pane label="系统参数" name="params">
        <ParamsView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.system-manage {
  :deep(.page-title),
  :deep(.page-subtitle) {
    display: none;
  }
  :deep(.el-tabs__header) {
    margin-bottom: 12px;
  }
  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
  }
  :deep(.el-tabs__item) {
    height: 36px;
    line-height: 36px;
    font-size: 14px;
    padding: 0 16px;
  }
  :deep(.el-tabs__content) {
    overflow: visible;
  }
}
</style>
