-- ============================================================
-- 运营管理平台 - 系统管理模块 数据库初始化脚本 (MySQL 版本)
-- 数据库: MySQL 5.7+ / MariaDB 10.3+
-- 字符集: utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS oss_ops DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE oss_ops;

-- 管理员表
DROP TABLE IF EXISTS sys_admin;
CREATE TABLE sys_admin (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password      VARCHAR(128) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL DEFAULT '',
  role          VARCHAR(32)  NOT NULL DEFAULT 'admin',
  enabled       TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at BIGINT       DEFAULT NULL,
  created_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 系统参数表 (key/value 配置)
DROP TABLE IF EXISTS sys_param;
CREATE TABLE sys_param (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key`      VARCHAR(128) NOT NULL,
  value      TEXT         NOT NULL,
  remark     VARCHAR(255) DEFAULT NULL,
  updated_at BIGINT       NOT NULL,
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 操作日志表 (审计)
DROP TABLE IF EXISTS sys_operation_log;
CREATE TABLE sys_operation_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(64)  NOT NULL DEFAULT '',
  ip          VARCHAR(64)  NOT NULL DEFAULT '',
  action      VARCHAR(64)  NOT NULL DEFAULT '',
  description VARCHAR(512) DEFAULT NULL,
  extra       TEXT,
  created_at  BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_created (created_at),
  KEY idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 数据库同步日志表
DROP TABLE IF EXISTS sys_db_sync_log;
CREATE TABLE sys_db_sync_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  direction    VARCHAR(32)  NOT NULL DEFAULT '',
  source_type  VARCHAR(16)  NOT NULL DEFAULT '',
  target_type  VARCHAR(16)  NOT NULL DEFAULT '',
  tables       VARCHAR(512) NOT NULL DEFAULT '',
  status       VARCHAR(16)  NOT NULL DEFAULT '',
  detail       TEXT,
  duration_ms  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 迁移跟踪表
DROP TABLE IF EXISTS sys_schema_migration;
CREATE TABLE sys_schema_migration (
  name        VARCHAR(128) NOT NULL,
  applied_at  BIGINT       NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 应用注册表（被管理的系统/服务）
DROP TABLE IF EXISTS sys_app;
CREATE TABLE sys_app (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(64)  NOT NULL,
  display_name    VARCHAR(128) NOT NULL DEFAULT '',
  type            VARCHAR(16)  NOT NULL DEFAULT 'nodejs',
  scope           VARCHAR(16)  NOT NULL DEFAULT 'internal',
  repo_url        VARCHAR(512) NOT NULL DEFAULT '',
  branch          VARCHAR(64)  NOT NULL DEFAULT 'main',
  deploy_path     VARCHAR(512) NOT NULL DEFAULT '',
  pm2_app_name    VARCHAR(64)  NOT NULL DEFAULT '',
  port            INT          DEFAULT NULL,
  install_cmd     VARCHAR(512) NOT NULL DEFAULT '',
  build_cmd       VARCHAR(512) NOT NULL DEFAULT '',
  build_enabled   TINYINT(1)   NOT NULL DEFAULT 0,
  start_file      VARCHAR(256) NOT NULL DEFAULT '',
  interpreter     VARCHAR(64)  NOT NULL DEFAULT '',
  deploy_excludes TEXT         NOT NULL,
  enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  remark          VARCHAR(255) DEFAULT NULL,
  created_at      BIGINT       NOT NULL,
  updated_at      BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 初始数据
-- ============================================================
INSERT INTO sys_admin (username, password, display_name, role, created_at)
VALUES ('admin', '$2a$10$PLACEHOLDER', '管理员', 'super_admin', UNIX_TIMESTAMP()*1000);

INSERT INTO sys_param (`key`, value, remark, updated_at, created_at) VALUES
  ('platform_name', '运营管理平台', '平台名称', UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('platform_version', '1.0.0', '当前版本', UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('db_type_default', 'sqlite', '默认数据库类型 sqlite|mysql', UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);

INSERT INTO sys_schema_migration (name, applied_at, description)
VALUES ('initial_schema', UNIX_TIMESTAMP()*1000, '系统管理模块初始表结构');

INSERT INTO sys_app (name, display_name, type, scope, pm2_app_name, install_cmd, build_cmd, build_enabled, deploy_excludes, remark, created_at, updated_at) VALUES
  ('oss-ops', '运营管理平台', 'nodejs', 'internal', 'oss-ops', 'npm install', 'npm run build', 1, 'node_modules/**,.git/**,db/**,logs/**,.env', '本平台自身', UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('python-demo', 'Python 服务示例', 'python', 'external', 'python-demo', 'pip install -r requirements.txt', '', 0, '__pycache__/**,venv/**,.git/**', 'Python 应用模板（示例）', UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);
