import { getDb } from './connection.js'
import { config } from '../config/index.js'
import { countAdmins, createAdmin } from './repositories.js'
import { hashPassword } from '../utils/crypto.js'

interface TableDef {
  name: string
  sqlite: string
  mysql: string
}

const TABLES: TableDef[] = [
  {
    name: 'sys_admin',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'admin',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_admin (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      password VARCHAR(128) NOT NULL,
      display_name VARCHAR(64) NOT NULL DEFAULT '',
      role VARCHAR(32) NOT NULL DEFAULT 'admin',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at BIGINT DEFAULT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'sys_param',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_param (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      remark TEXT,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_param (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`key\` VARCHAR(128) NOT NULL,
      value TEXT NOT NULL,
      remark VARCHAR(255) DEFAULT NULL,
      updated_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'sys_operation_log',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_operation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      description TEXT,
      extra TEXT,
      created_at INTEGER NOT NULL
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_operation_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL DEFAULT '',
      ip VARCHAR(64) NOT NULL DEFAULT '',
      action VARCHAR(64) NOT NULL DEFAULT '',
      description VARCHAR(512) DEFAULT NULL,
      extra TEXT,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_created (created_at),
      KEY idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'sys_db_sync_log',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_db_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT '',
      tables TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      detail TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_db_sync_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      direction VARCHAR(32) NOT NULL DEFAULT '',
      source_type VARCHAR(16) NOT NULL DEFAULT '',
      target_type VARCHAR(16) NOT NULL DEFAULT '',
      tables VARCHAR(512) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT '',
      detail TEXT,
      duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'sys_schema_migration',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_schema_migration (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_schema_migration (
      name VARCHAR(128) NOT NULL,
      applied_at BIGINT NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'sys_app',
    sqlite: `CREATE TABLE IF NOT EXISTS sys_app (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'nodejs',
      scope TEXT NOT NULL DEFAULT 'internal',
      repo_url TEXT NOT NULL DEFAULT '',
      branch TEXT NOT NULL DEFAULT 'main',
      deploy_path TEXT NOT NULL DEFAULT '',
      pm2_app_name TEXT NOT NULL DEFAULT '',
      port INTEGER,
      install_cmd TEXT NOT NULL DEFAULT '',
      build_cmd TEXT NOT NULL DEFAULT '',
      build_enabled INTEGER NOT NULL DEFAULT 0,
      start_file TEXT NOT NULL DEFAULT '',
      interpreter TEXT NOT NULL DEFAULT '',
      deploy_excludes TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      remark TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS sys_app (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL,
      display_name VARCHAR(128) NOT NULL DEFAULT '',
      type VARCHAR(16) NOT NULL DEFAULT 'nodejs',
      scope VARCHAR(16) NOT NULL DEFAULT 'internal',
      repo_url VARCHAR(512) NOT NULL DEFAULT '',
      branch VARCHAR(64) NOT NULL DEFAULT 'main',
      deploy_path VARCHAR(512) NOT NULL DEFAULT '',
      pm2_app_name VARCHAR(64) NOT NULL DEFAULT '',
      port INT DEFAULT NULL,
      install_cmd VARCHAR(512) NOT NULL DEFAULT '',
      build_cmd VARCHAR(512) NOT NULL DEFAULT '',
      build_enabled TINYINT(1) NOT NULL DEFAULT 0,
      start_file VARCHAR(256) NOT NULL DEFAULT '',
      interpreter VARCHAR(64) NOT NULL DEFAULT '',
      deploy_excludes TEXT NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      remark VARCHAR(255) DEFAULT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  }
]

const INDEXES: { sqlite?: string; mysql?: string }[] = [
  { sqlite: 'CREATE INDEX IF NOT EXISTS idx_sys_operation_log_created ON sys_operation_log(created_at)', mysql: 'CREATE INDEX idx_sys_operation_log_created ON sys_operation_log(created_at)' },
  { sqlite: 'CREATE INDEX IF NOT EXISTS idx_sys_operation_log_action ON sys_operation_log(action)', mysql: 'CREATE INDEX idx_sys_operation_log_action ON sys_operation_log(action)' },
  { sqlite: 'CREATE INDEX IF NOT EXISTS idx_sys_db_sync_log_created ON sys_db_sync_log(created_at)', mysql: 'CREATE INDEX idx_sys_db_sync_log_created ON sys_db_sync_log(created_at)' }
]

const DEFAULT_PARAMS: { key: string; value: string; remark: string }[] = [
  { key: 'platform_name', value: '运营管理平台', remark: '平台名称' },
  { key: 'platform_version', value: '1.0.0', remark: '当前版本' },
  { key: 'db_type_default', value: 'sqlite', remark: '默认数据库类型 sqlite|mysql' }
]

async function migrationApplied(name: string): Promise<boolean> {
  const db = getDb()
  const r = await db.get<{ name: string }>(
    'SELECT name FROM sys_schema_migration WHERE name = ?',
    [name]
  )
  return !!r
}

async function recordMigration(name: string, description: string): Promise<void> {
  await getDb().run(
    'INSERT INTO sys_schema_migration (name, applied_at, description) VALUES (?, ?, ?)',
    [name, Date.now(), description]
  )
}

export async function initDatabase(): Promise<void> {
  const db = getDb()
  const dialect = db.type

  for (const t of TABLES) {
    await db.exec(dialect === 'mysql' ? t.mysql : t.sqlite)
  }

  for (const idx of INDEXES) {
    const sql = dialect === 'mysql' ? idx.mysql : idx.sqlite
    if (!sql) continue
    if (dialect === 'mysql') {
      try { await db.exec(sql) } catch { /* 索引可能已存在 */ }
    } else {
      await db.exec(sql)
    }
  }

  // 初始化系统参数
  for (const p of DEFAULT_PARAMS) {
    const exists = await db.get<{ id: number }>('SELECT id FROM sys_param WHERE key = ?', [p.key])
    if (!exists) {
      const now = Date.now()
      if (dialect === 'sqlite') {
        await db.run('INSERT INTO sys_param (key, value, remark, updated_at, created_at) VALUES (?, ?, ?, ?, ?)', [p.key, p.value, p.remark, now, now])
      } else {
        await db.run('INSERT INTO sys_param (`key`, value, remark, updated_at, created_at) VALUES (?, ?, ?, ?, ?)', [p.key, p.value, p.remark, now, now])
      }
    }
  }

  // 初始化默认管理员
  if ((await countAdmins()) === 0) {
    const hashed = await hashPassword(config.admin.password)
    await createAdmin({
      username: config.admin.username,
      password: hashed,
      display_name: '管理员',
      role: 'super_admin'
    })
  }

  // 初始化默认应用（注册平台自身 + 一个 Python 示例模板）
  await seedDefaultApps()

  if (!(await migrationApplied('initial_schema'))) {
    await recordMigration('initial_schema', '系统管理模块初始表结构')
  }
}

async function seedDefaultApps(): Promise<void> {
  const db = getDb()
  const cnt = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM sys_app')
  if ((cnt?.c ?? 0) > 0) return
  const now = Date.now()
  // 平台自身（nodejs）
  await db.run(
    `INSERT INTO sys_app (name, display_name, type, scope, repo_url, branch, deploy_path, pm2_app_name, install_cmd, build_cmd, build_enabled, deploy_excludes, remark, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'oss-ops', '运营管理平台', 'nodejs', 'internal',
      config.update.githubUrl, config.update.githubBranch, config.projectRoot, config.update.pm2AppName,
      'npm install', 'npm run build', 1,
      'node_modules/**,.git/**,db/**,logs/**,.env,update-config.json',
      '本平台自身', now, now
    ]
  )
  // Python 示例模板（disabled，仅作模板参考）
  await db.run(
    `INSERT INTO sys_app (name, display_name, type, scope, repo_url, branch, deploy_path, pm2_app_name, install_cmd, build_cmd, build_enabled, start_file, interpreter, enabled, deploy_excludes, remark, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'python-demo', 'Python 服务示例', 'python', 'external',
      '', 'main', '', 'python-demo',
      'pip install -r requirements.txt', '', 0,
      'app.py', 'python', 0,
      '__pycache__/**,venv/**,.git/**,logs/**',
      'Python 应用模板（示例，请按需修改后启用）', now, now
    ]
  )
}
