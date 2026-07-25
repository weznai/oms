import { getDb } from './connection.js'

export type AppType = 'nodejs' | 'python' | 'java'
export type AppScope = 'internal' | 'external'
export type ProcessMode = 'pm2' | 'custom'

export interface AppRow {
  id: number
  name: string
  display_name: string
  type: AppType
  scope: AppScope
  repo_url: string
  branch: string
  deploy_path: string
  pm2_app_name: string
  port: number | null
  install_cmd: string
  build_cmd: string
  build_enabled: number
  start_file: string
  interpreter: string
  process_mode: ProcessMode
  start_cmd: string
  stop_cmd: string
  deploy_excludes: string
  access_url: string
  log_file: string
  enabled: number
  remark: string | null
  created_at: number
  updated_at: number
}

export async function listApps(): Promise<AppRow[]> {
  return getDb().all<AppRow>('SELECT * FROM sys_app ORDER BY id')
}

export async function findAppById(id: number): Promise<AppRow | null> {
  return getDb().get<AppRow>('SELECT * FROM sys_app WHERE id = ?', [id])
}

export async function findAppByName(name: string): Promise<AppRow | null> {
  return getDb().get<AppRow>('SELECT * FROM sys_app WHERE name = ?', [name])
}

export interface AppInput {
  name: string
  display_name: string
  type: AppType
  scope: AppScope
  repo_url: string
  branch: string
  deploy_path: string
  pm2_app_name: string
  port: number | null
  install_cmd: string
  build_cmd: string
  build_enabled: boolean
  start_file: string
  interpreter: string
  process_mode: ProcessMode
  start_cmd: string
  stop_cmd: string
  deploy_excludes: string
  access_url: string
  log_file: string
  enabled: boolean
  remark: string
}

export async function createApp(data: AppInput): Promise<number> {
  const now = Date.now()
  const res = await getDb().run(
    `INSERT INTO sys_app
     (name, display_name, type, scope, repo_url, branch, deploy_path, pm2_app_name, port,
       install_cmd, build_cmd, build_enabled, start_file, interpreter, process_mode, start_cmd, stop_cmd,
       deploy_excludes, access_url, log_file, enabled, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name, data.display_name, data.type, data.scope, data.repo_url, data.branch,
      data.deploy_path, data.pm2_app_name, data.port, data.install_cmd, data.build_cmd,
      data.build_enabled ? 1 : 0, data.start_file, data.interpreter, data.process_mode,
      data.start_cmd, data.stop_cmd, data.deploy_excludes, data.access_url, data.log_file,
      data.enabled ? 1 : 0, data.remark, now, now
    ]
  )
  return res.lastInsertId as number
}

export async function updateApp(id: number, data: AppInput): Promise<void> {
  const now = Date.now()
  await getDb().run(
    `UPDATE sys_app SET
       name=?, display_name=?, type=?, scope=?, repo_url=?, branch=?, deploy_path=?, pm2_app_name=?, port=?,
       install_cmd=?, build_cmd=?, build_enabled=?, start_file=?, interpreter=?, process_mode=?, start_cmd=?, stop_cmd=?,
       deploy_excludes=?, access_url=?, log_file=?, enabled=?, remark=?, updated_at=?
      WHERE id=?`,
    [
      data.name, data.display_name, data.type, data.scope, data.repo_url, data.branch,
      data.deploy_path, data.pm2_app_name, data.port, data.install_cmd, data.build_cmd,
      data.build_enabled ? 1 : 0, data.start_file, data.interpreter, data.process_mode,
      data.start_cmd, data.stop_cmd, data.deploy_excludes, data.access_url, data.log_file,
      data.enabled ? 1 : 0, data.remark, now, id
    ]
  )
}

export async function deleteApp(id: number): Promise<void> {
  await getDb().run('DELETE FROM sys_app WHERE id = ?', [id])
}

export async function setAppEnabled(id: number, enabled: boolean): Promise<void> {
  await getDb().run('UPDATE sys_app SET enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, Date.now(), id])
}
