-- ============================================================
-- 运营管理平台 - 系统管理模块 数据库初始化脚本 (SQLite 版本)
-- 数据库: SQLite 3.x
-- 字符集: UTF-8
-- ============================================================

-- 管理员表
DROP TABLE IF EXISTS sys_admin;
CREATE TABLE sys_admin (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,
  display_name  TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL DEFAULT 'admin',
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_login_at INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_sys_admin_username ON sys_admin(username);

-- 系统参数表 (key/value 配置)
DROP TABLE IF EXISTS sys_param;
CREATE TABLE sys_param (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL DEFAULT '',
  remark     TEXT,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sys_param_key ON sys_param(key);

-- 操作日志表 (审计)
DROP TABLE IF EXISTS sys_operation_log;
CREATE TABLE sys_operation_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL DEFAULT '',
  description TEXT,
  extra       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sys_operation_log_created ON sys_operation_log(created_at);
CREATE INDEX idx_sys_operation_log_action  ON sys_operation_log(action);

-- 数据库同步日志表
DROP TABLE IF EXISTS sys_db_sync_log;
CREATE TABLE sys_db_sync_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  direction    TEXT NOT NULL DEFAULT '',
  source_type  TEXT NOT NULL DEFAULT '',
  target_type  TEXT NOT NULL DEFAULT '',
  tables       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT '',
  detail       TEXT,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_sys_db_sync_log_created ON sys_db_sync_log(created_at);

-- 迁移跟踪表
DROP TABLE IF EXISTS sys_schema_migration;
CREATE TABLE sys_schema_migration (
  name        TEXT PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT
);

-- 应用注册表（被管理的系统/服务）
DROP TABLE IF EXISTS sys_app;
CREATE TABLE sys_app (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL UNIQUE,
  display_name   TEXT    NOT NULL DEFAULT '',
  type           TEXT    NOT NULL DEFAULT 'nodejs',   -- nodejs | python
  scope          TEXT    NOT NULL DEFAULT 'internal', -- internal | external
  repo_url       TEXT    NOT NULL DEFAULT '',
  branch         TEXT    NOT NULL DEFAULT 'main',
  deploy_path    TEXT    NOT NULL DEFAULT '',
  pm2_app_name   TEXT    NOT NULL DEFAULT '',
  port           INTEGER,
  install_cmd    TEXT    NOT NULL DEFAULT '',
  build_cmd      TEXT    NOT NULL DEFAULT '',
  build_enabled  INTEGER NOT NULL DEFAULT 0,
  start_file     TEXT    NOT NULL DEFAULT '',         -- python 入口文件
  interpreter    TEXT    NOT NULL DEFAULT '',         -- python 解释器
  deploy_excludes TEXT   NOT NULL DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  remark         TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ============================================================
-- 初始数据
-- ============================================================
-- 默认管理员 (密码 admin123 的 bcrypt 哈希，首次运行会由程序重置)
INSERT INTO sys_admin (username, password, display_name, role, created_at)
VALUES ('admin', '$2a$10$PLACEHOLDER', '管理员', 'super_admin', 0);

-- 默认系统参数
INSERT INTO sys_param (key, value, remark, updated_at, created_at) VALUES
  ('platform_name', '运营管理平台', '平台名称', 0, 0),
  ('platform_version', '1.0.0', '当前版本', 0, 0),
  ('db_type_default', 'sqlite', '默认数据库类型 sqlite|mysql', 0, 0);

-- 记录初始迁移
INSERT INTO sys_schema_migration (name, applied_at, description)
VALUES ('initial_schema', 0, '系统管理模块初始表结构');

-- 默认应用（平台自身 nodejs + python 示例模板）
INSERT INTO sys_app (name, display_name, type, scope, pm2_app_name, install_cmd, build_cmd, build_enabled, deploy_excludes, remark, created_at, updated_at) VALUES
  ('oms-ops', '运营管理平台', 'nodejs', 'internal', 'oms-ops', 'npm install', 'npm run build', 1, 'node_modules/**,.git/**,db/**,logs/**,.env', '本平台自身', 0, 0),
  ('python-demo', 'Python 服务示例', 'python', 'external', 'python-demo', 'pip install -r requirements.txt', '', 0, '__pycache__/**,venv/**,.git/**', 'Python 应用模板（示例）', 0, 0);
