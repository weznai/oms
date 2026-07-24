// 数据库初始化脚本 - 独立运行，创建表结构和默认数据
// 用法: npm run db:init
import { initDatabase } from '../server/db/index.js'
import { closeDb } from '../server/db/connection.js'
import { logger } from '../server/utils/logger.js'

async function main(): Promise<void> {
  logger.info('开始初始化数据库...')
  await initDatabase()
  logger.info('数据库初始化完成')
  await closeDb()
  process.exit(0)
}

main().catch((err) => {
  logger.error('初始化失败', err)
  process.exit(1)
})
