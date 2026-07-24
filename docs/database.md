# 数据库设计文档

支持 **SQLite**（默认）与 **MySQL** 两种数据库，表结构一致，DDL 按方言生成。

- SQLite 脚本：[sql/schema-sqlite.sql](./sql/schema-sqlite.sql)
- MySQL 脚本：[sql/schema-mysql.sql](./sql/schema-mysql.sql)

> 程序启动时会自动建表（`initDatabase()`），SQL 脚本作为参考与手动初始化备用。

---

## 1. 表清单

| 表名 | 说明 | 关键字段 |
|---|---|---|
| `sys_admin` | 管理员账号 | username(唯一)、password、role、enabled |
| `sys_app` | 应用注册表（被管理的系统） | name(唯一)、type、scope、repo_url、各命令 |
| `sys_param` | 系统参数（key/value） | key(唯一)、value、remark |
| `sys_operation_log` | 操作日志（审计） | username、action、ip、description、extra |
| `sys_db_sync_log` | 数据库同步日志 | direction、source_type、target_type、status |
| `sys_schema_migration` | 迁移跟踪 | name(主键)、applied_at、description |

---

## 2. 表结构详解

### 2.1 sys_admin（管理员）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER / INT | 主键自增 | |
| username | TEXT / VARCHAR(64) | 唯一非空 | 登录用户名 |
| password | TEXT / VARCHAR(128) | 非空 | `scrypt$10$<salt>$<derived>` |
| display_name | TEXT / VARCHAR(64) | 默认 '' | 显示名 |
| role | TEXT / VARCHAR(32) | 默认 'admin' | admin / super_admin |
| enabled | INTEGER / TINYINT | 默认 1 | 是否启用 |
| last_login_at | INTEGER / BIGINT | 可空 | 最近登录时间戳 |
| created_at | INTEGER / BIGINT | 非空 | 创建时间戳 |

### 2.2 sys_app（应用注册表）

被管理的系统/服务，支持 nodejs/python 类型，可针对每个应用执行发布/更新/重启/停止。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT | 主键自增 |
| name | VARCHAR(64) | 唯一，应用标识（如 user-service） |
| display_name | VARCHAR(128) | 显示名称 |
| type | VARCHAR(16) | `nodejs` / `python` |
| scope | VARCHAR(16) | `internal`（内部）/ `external`（外部） |
| repo_url | VARCHAR(512) | 代码仓库地址 |
| branch | VARCHAR(64) | 分支，默认 main |
| deploy_path | VARCHAR(512) | 部署目录（空则默认工作目录） |
| pm2_app_name | VARCHAR(64) | PM2 进程名 |
| port | INT | 端口（可选） |
| install_cmd | VARCHAR(512) | 安装命令（nodejs: npm install / python: pip install） |
| build_cmd | VARCHAR(512) | 构建命令 |
| build_enabled | TINYINT | 是否启用构建 |
| start_file | VARCHAR(256) | Python 入口文件（app.py） |
| interpreter | VARCHAR(64) | Python 解释器（python） |
| deploy_excludes | TEXT | 部署排除规则（glob，逗号或换行分隔） |
| enabled | TINYINT | 是否启用 |
| remark | VARCHAR(255) | 备注 |
| created_at / updated_at | BIGINT | 时间戳 |

**种子数据**：`oss-ops`（本平台，nodejs/内部）+ `python-demo`（Python 模板示例，默认禁用）

### 2.2 sys_param（系统参数）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER / INT | 主键自增 | |
| key | TEXT / VARCHAR(128) | 唯一非空 | 参数键 |
| value | TEXT | 非空 | 参数值 |
| remark | TEXT / VARCHAR(255) | 可空 | 说明 |
| updated_at | INTEGER / BIGINT | 非空 | |
| created_at | INTEGER / BIGINT | 非空 | |

**种子数据**

| key | value | 说明 |
|---|---|---|
| platform_name | 运营管理平台 | 平台名称 |
| platform_version | 1.0.0 | 当前版本 |
| db_type_default | sqlite | 默认数据库类型 |

### 2.3 sys_operation_log（操作日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键自增 |
| username | VARCHAR(64) | 操作人 |
| ip | VARCHAR(64) | 来源 IP |
| action | VARCHAR(64) | 操作类型 |
| description | VARCHAR(512) | 描述 |
| extra | TEXT | 附加数据 JSON |
| created_at | BIGINT | 时间戳 |

**action 取值**：`login`、`logout`、`change_password`、`system_update`、`update_config`、`clear_logs`、`db_switch`、`db_sync`、`param_save`、`param_delete`

### 2.4 sys_db_sync_log（数据库同步日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键自增 |
| direction | VARCHAR(32) | mysql_to_sqlite |
| source_type | VARCHAR(16) | mysql |
| target_type | VARCHAR(16) | sqlite |
| tables | VARCHAR(512) | 表名逗号分隔 |
| status | VARCHAR(16) | success/partial/failed |
| detail | TEXT | 详细结果 JSON |
| duration_ms | INT | 耗时毫秒 |
| created_at | BIGINT | 时间戳 |

### 2.5 sys_schema_migration（迁移跟踪）

| 字段 | 类型 | 说明 |
|---|---|---|
| name | VARCHAR(128) | 主键，迁移名 |
| applied_at | BIGINT | 应用时间戳 |
| description | VARCHAR(255) | 描述 |

---

## 3. 数据访问层

参考 `D:\work\openCode\fund` 的 SQL 操作模式：

- **预处理语句**：所有查询使用 `prepare(sql).run/all/get(...params)` 参数绑定，防注入
- **Upsert**：SQLite 用 `ON CONFLICT(key) DO UPDATE`；MySQL 用 `SELECT` 判存后 `INSERT/UPDATE`
- **事务批量**：`transaction(() => {...})` 包裹批量写入（如同步全表数据）
- **Repository 函数式**：`server/db/repositories.ts` 按领域导出 `getAllParams`、`addOperationLog` 等，通过 barrel `server/db/index.ts` 统一导出
- **双库分支**：涉及保留字（`key`）或语法差异处，按 `db.type` 分支处理

---

## 4. 迁移系统

### 启动自动迁移
`initDatabase()` 在服务启动时执行：

1. 按方言（sqlite/mysql）执行各表 `CREATE TABLE IF NOT EXISTS`
2. 创建索引（MySQL 用 try/catch 容错已存在）
3. 插入默认系统参数（不存在才插）
4. 初始化默认管理员（表为空才插）
5. 记录 `initial_schema` 迁移

### 扩展迁移
后续表结构变更在 `migrations.ts` 的迁移列表中新增条目，通过 `sys_schema_migration` 跟踪是否已应用，幂等执行。

---

## 5. 双库配置

`.env` 关键项：

```ini
# 数据库类型: sqlite | mysql
DB_TYPE=sqlite

# SQLite
DB_SQLITE_PATH=./db/oss-ops.db

# MySQL
DB_MYSQL_HOST=127.0.0.1
DB_MYSQL_PORT=3306
DB_MYSQL_USER=root
DB_MYSQL_PASSWORD=
DB_MYSQL_DATABASE=oss_ops
DB_MYSQL_CONNECTION_LIMIT=10
```

- **默认 SQLite**：零配置，数据库文件即 `db/oss-ops.db`
- **切 MySQL**：`DB_TYPE=mysql` 并填好连接信息即可
- **MySQL 手动建库**：执行 `docs/sql/schema-mysql.sql`
- **运行时切换**：前端「数据库管理」页或 `POST /api/db/switch`
