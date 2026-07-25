import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './styles/global.scss'

// 命令式服务（ElMessageBox / ElMessage）以函数方式调用，
// unplugin-vue-components 只能识别模板标签，无法自动引入其样式，
// 需手动引入，否则遮罩/定位/背景缺失，导致确认框穿透文字、位置错乱。
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)

app.mount('#app')
