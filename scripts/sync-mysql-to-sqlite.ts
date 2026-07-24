// MySQL → SQLite 手动同步脚本
// 用法: npm run db:sync
import { syncMysqlToSqlite } from '../server/services/db-sync.service.js'
import { logger } from '../server/utils/logger.js'

async function main(): Promise<void> {
  logger.info('开始执行 MySQL → SQLite 同步...')
  const result = await syncMysqlToSqlite()
  logger.info(result.message)
  for (const r of result.results) {
    logger.info(`  ${r.table}: ${r.rows} 行 [${r.status}]${r.message ? ' - ' + r.message : ''}`)
  }
  process.exit(result.status === 'failed' ? 1 : 0)
}

main().catch((err) => {
  logger.error('同步失败', err)
  process.exit(1)
})
