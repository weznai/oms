import express from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from './config/index.js'
import { initDatabase, closeDb } from './db/index.js'
import { logger } from './utils/logger.js'

import authRoutes from './routes/auth.routes.js'
import systemRoutes from './routes/system.routes.js'
import systemUpdateRoutes from './routes/system-update.routes.js'
import appRoutes from './routes/app.routes.js'
import dbRoutes from './routes/db.routes.js'
import paramRoutes from './routes/param.routes.js'
import logRoutes from './routes/log.routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function bootstrap(): Promise<void> {
  await initDatabase()
  logger.info('数据库初始化完成')

  const app = express()

  app.use(compression())
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true
  }))

  // 慢请求诊断：记录每个 /api 请求的处理耗时（临时，用于区分 服务端慢 vs 网络慢）
  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const dur = Date.now() - start
      if (req.path.startsWith('/api')) {
        logger.info(`[API ${dur}ms] ${req.method} ${req.originalUrl}`)
      }
    })
    next()
  })

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ code: 0, message: 'ok', data: { status: 'up', uptime: process.uptime() } })
  })

  // 业务路由
  app.use('/api/auth', authRoutes)
  app.use('/api/system', systemRoutes)
  app.use('/api/system', systemUpdateRoutes)
  app.use('/api/apps', appRoutes)
  app.use('/api/db', dbRoutes)
  app.use('/api/params', paramRoutes)
  app.use('/api/logs', logRoutes)

  // 静态资源 + SPA 兜底（生产环境）
  const distDir = path.join(__dirname, 'dist')
  if (fs.existsSync(distDir)) {
    // 带 hash 的构建产物（/assets/*）：文件名随内容变化，可永久缓存且 immutable
    app.use('/assets', express.static(path.join(distDir, 'assets'), {
      maxAge: '1y',
      immutable: true
    }))
    // 其余静态文件（favicon 等）：短缓存
    app.use(express.static(distDir, { maxAge: '1h' }))
    // SPA 兜底：index.html 必须不缓存，以便发版后浏览器立即拉到新引用
    app.get('*', (_req, res) => {
      res.set('Cache-Control', 'no-cache')
      res.sendFile(path.join(distDir, 'index.html'))
    })
  }

  // 全局错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('未捕获错误', err)
    res.status(500).json({ code: 500, message: err.message || '服务器内部错误', data: null })
  })

  const server = app.listen(config.port, () => {
    logger.info(`运营管理平台服务已启动: http://127.0.0.1:${config.port}`)
    logger.info(`数据库类型: ${config.db.type}`)
  })

  const shutdown = (signal: string): void => {
    logger.info(`收到 ${signal}，正在关闭...`)
    server.close(async () => {
      await closeDb()
      logger.info('已关闭，再见')
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

bootstrap().catch((err) => {
  logger.error('启动失败', err)
  process.exit(1)
})
