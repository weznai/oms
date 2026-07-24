import { config } from '../config/index.js'
import { SqliteAdapter } from './sqlite-adapter.js'
import { MysqlAdapter } from './mysql-adapter.js'
import type { DbAdapter } from './types.js'

let adapter: DbAdapter | null = null

/** 创建一个数据库适配器（不注入全局） */
export function createAdapter(type: 'sqlite' | 'mysql' = config.db.type): DbAdapter {
  if (type === 'mysql') {
    return new MysqlAdapter(config.db.mysql)
  }
  return new SqliteAdapter(config.db.sqlite.path)
}

/** 获取全局主适配器 */
export function getDb(): DbAdapter {
  if (!adapter) {
    adapter = createAdapter()
  }
  return adapter
}

/** 运行时切换数据库类型（切换后重建主适配器） */
export async function switchDbType(type: 'sqlite' | 'mysql'): Promise<DbAdapter> {
  if (adapter) {
    await adapter.close()
  }
  adapter = createAdapter(type)
  return adapter
}

export function currentDbType(): 'sqlite' | 'mysql' {
  return adapter?.type ?? config.db.type
}

export async function closeDb(): Promise<void> {
  if (adapter) {
    await adapter.close()
    adapter = null
  }
}

export * from './types.js'
