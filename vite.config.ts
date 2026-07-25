import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'auto-imports.d.ts',
      eslintrc: { enabled: false }
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'components.d.ts'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:1100',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'server/dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    chunkSizeWarningLimit: 1500
    // manualChunks 会把 element-plus 钉成一个 chunk，破坏 tree-shaking（保留全量组件）
    // 去掉后让 Vite 自动分包：element-plus 组件随路由懒加载，首屏只加载用到的部分
  }
})
