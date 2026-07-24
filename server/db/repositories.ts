import { getDb } from './connection.js'

// ============ 管理员 ============
export interface AdminRow {
  id: number
  username: string
  password: string
  display_name: string
  role: string
  enabled: number
  last_login_at: number | null
  created_at: number
}

export async function findAdminByName(username: string): Promise<AdminRow | null> {
  return getDb().get<AdminRow>('SELECT * FROM sys_admin WHERE username = ?', [username])
}

export async function findAdminById(id: number): Promise<AdminRow | null> {
  return getDb().get<AdminRow>('SELECT * FROM sys_admin WHERE id = ?', [id])
}

export async function listAdmins(): Promise<AdminRow[]> {
  return getDb().all<AdminRow>('SELECT * FROM sys_admin ORDER BY id')
}

export async function updateAdminPassword(id: number, hashed: string): Promise<void> {
  await getDb().run('UPDATE sys_admin SET password = ? WHERE id = ?', [hashed, id])
}

export async function updateAdminLogin(id: number, at: number): Promise<void> {
  await getDb().run('UPDATE sys_admin SET last_login_at = ? WHERE id = ?', [at, id])
}

export async function countAdmins(): Promise<number> {
  const r = await getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM sys_admin')
  return r?.c ?? 0
}

export async function createAdmin(data: {
  username: string
  password: string
  display_name: string
  role?: string
}): Promise<number> {
  const res = await getDb().run(
    'INSERT INTO sys_admin (username, password, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [data.username, data.password, data.display_name, data.role ?? 'admin', Date.now()]
  )
  return res.lastInsertId as number
}

// ============ 系统参数（key/value） ============
export interface ParamRow {
  id: number
  key: string
  value: string
  remark: string | null
  updated_at: number
  created_at: number
}

export async function getAllParams(): Promise<ParamRow[]> {
  return getDb().all<ParamRow>('SELECT * FROM sys_param ORDER BY key')
}

export async function getParam(key: string): Promise<string | null> {
  const r = await getDb().get<{ value: string }>('SELECT value FROM sys_param WHERE key = ?', [key])
  return r?.value ?? null
}

export async function setParam(key: string, value: string, remark?: string): Promise<void> {
  const db = getDb()
  if (db.type === 'sqlite') {
    await db.run(
      `INSERT INTO sys_param (key, value, remark, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, remark = excluded.remark, updated_at = excluded.updated_at`,
      [key, value, remark ?? null, Date.now()]
    )
  } else {
    const existing = await db.get<{ id: number }>('SELECT id FROM sys_param WHERE `key` = ?', [key])
    if (existing) {
      await db.run('UPDATE sys_param SET value = ?, remark = ?, updated_at = ? WHERE id = ?', [
        value, remark ?? null, Date.now(), existing.id
      ])
    } else {
      await db.run(
        'INSERT INTO sys_param (`key`, value, remark, updated_at) VALUES (?, ?, ?, ?)',
        [key, value, remark ?? null, Date.now()]
      )
    }
  }
}

export async function deleteParam(key: string): Promise<void> {
  await getDb().run('DELETE FROM sys_param WHERE key = ?', [key])
}

// ============ 操作日志 ============
export interface OperationLogRow {
  id: number
  username: string
  ip: string
  action: string
  description: string | null
  extra: string | null
  created_at: number
}

export async function addOperationLog(data: {
  username: string
  ip: string
  action: string
  description?: string
  extra?: string
}): Promise<void> {
  await getDb().run(
    `INSERT INTO sys_operation_log (username, ip, action, description, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.username, data.ip, data.action, data.description ?? null, data.extra ?? null, Date.now()]
  )
}

export interface LogQuery {
  page: number
  pageSize: number
  action?: string
  username?: string
  startDate?: number
  endDate?: number
}

export async function getOperationLogList(q: LogQuery): Promise<{ list: OperationLogRow[]; total: number }> {
  const db = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (q.action) {
    where.push('action = ?')
    params.push(q.action)
  }
  if (q.username) {
    where.push('username = ?')
    params.push(q.username)
  }
  if (q.startDate) {
    where.push('created_at >= ?')
    params.push(q.startDate)
  }
  if (q.endDate) {
    where.push('created_at <= ?')
    params.push(q.endDate)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (q.page - 1) * q.pageSize

  const totalRow = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM sys_operation_log ${whereSql}`, params)
  const total = totalRow?.c ?? 0
  const list = await db.all<OperationLogRow>(
    `SELECT * FROM sys_operation_log ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, q.pageSize, offset]
  )
  return { list, total }
}

// ============ 数据库同步日志 ============
export interface DbSyncLogRow {
  id: number
  direction: string
  source_type: string
  target_type: string
  tables: string
  status: string
  detail: string | null
  duration_ms: number
  created_at: number
}

export async function addDbSyncLog(data: {
  direction: string
  source_type: string
  target_type: string
  tables: string
  status: string
  detail?: string
  duration_ms: number
}): Promise<void> {
  await getDb().run(
    `INSERT INTO sys_db_sync_log (direction, source_type, target_type, tables, status, detail, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.direction, data.source_type, data.target_type, data.tables, data.status, data.detail ?? null, data.duration_ms, Date.now()]
  )
}

export async function getDbSyncLogList(page: number, pageSize: number): Promise<{ list: DbSyncLogRow[]; total: number }> {
  const db = getDb()
  const totalRow = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM sys_db_sync_log')
  const total = totalRow?.c ?? 0
  const offset = (page - 1) * pageSize
  const list = await db.all<DbSyncLogRow>(
    'SELECT * FROM sys_db_sync_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [pageSize, offset]
  )
  return { list, total }
}

// ============ 表信息（数据库管理） ============
export async function listTables(): Promise<string[]> {
  const db = getDb()
  if (db.type === 'sqlite') {
    const rows = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    return rows.map((r) => r.name)
  }
  const rows = await db.all<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
  )
  return rows.map((r) => r.name)
}

export async function getTableInfo(tableName: string): Promise<{ columns: unknown[]; rowCount: number }> {
  const db = getDb()
  if (db.type === 'sqlite') {
    const cols = await db.all(`PRAGMA table_info(${tableName})`)
    const countRow = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "${tableName}"`)
    return { columns: cols, rowCount: countRow?.c ?? 0 }
  }
  const cols = await db.all(
    `SELECT column_name, data_type, is_nullable, column_default, column_key
     FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`,
    [tableName]
  )
  const countRow = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM \`${tableName}\``)
  return { columns: cols, rowCount: countRow?.c ?? 0 }
}
