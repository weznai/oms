# 架构设计文档

## 1. 总体架构

```
┌─────────────────────────────────────────────┐
│              浏览器 (Vue 3 SPA)              │
│  Element Plus + Pinia + Vue Router          │
└───────────────────┬─────────────────────────┘
                    │ HTTP /api/*
┌───────────────────▼─────────────────────────┐
│            Express 后端 (Node.js)            │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 认证中间件 │ │ 业务路由  │ │ 服务层        │  │
│  └─────────┘ └──────────┘ └──────┬───────┘  │
│                                   │          │
│              ┌────────────────────▼───────┐  │
│              │   DB 适配器层 (DbAdapter)   │  │
│              └───┬──────────────────┬─────┘  │
└──────────────────┼──────────────────┼────────┘
        ┌─────────▼─────────┐  ┌──────▼──────┐
        │  SQLite 适配器     │  │ MySQL 适配器 │
        │  (node:sqlite)    │  │  (mysql2)   │
        └───────────────────┘  └─────────────┘
```

### 设计原则
1. **前后端同构 TypeScript**：共享类型，降低维护成本
2. **数据库抽象**：通过 `DbAdapter` 接口屏蔽 SQLite/MySQL 差异，业务代码不感知底层数据库
3. **零原生编译**：SQLite 采用 Node 内置模块，部署无需 C++ 工具链
4. **配置驱动**：行为可通过 `.env` 与 `sys_param` 表动态调整

---

## 2. 数据库抽象层

### 2.1 DbAdapter 接口

统一异步接口，两种实现均满足：

```typescript
interface DbAdapter {
  readonly type: 'sqlite' | 'mysql'
  all<T>(sql: string, params?: unknown[]): Promise<T[]>
  get<T>(sql: string, params?: unknown[]): Promise<T | null>
  run(sql: string, params?: unknown[]): Promise<RunResult>
  exec(sql: string): Promise<void>             // 批量 DDL
  transaction<T>(fn: () => Promise<T>): Promise<T>
  close(): Promise<void>
}
```

### 2.2 为什么是异步

`node:sqlite` 本身是同步 API，但 MySQL（mysql2）是异步。为保证**同一套业务代码可同时跑在两种库上**，适配器统一为异步。SQLite 适配器内部仍是同步调用，仅用 Promise 包装，性能无损。

### 2.3 双库差异处理

| 差异点 | SQLite | MySQL | 处理方式 |
|---|---|---|---|
| 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT AUTO_INCREMENT` | 迁移系统按方言生成 |
| 关键字列名 | `"key"` | `` `key` `` | 仓储层用 `quoteCol()` |
| Upsert | `ON CONFLICT(key) DO UPDATE` | `SELECT` + `INSERT/UPDATE` | 仓储层分支处理 |
| 表列表 | `sqlite_master` | `information_schema` | `listTables()` 分支 |
| 列信息 | `PRAGMA table_info` | `information_schema.columns` | `getTableInfo()` 分支 |

### 2.4 切换机制

- **启动切换**：`.env` 的 `DB_TYPE` 决定主库（`sqlite` / `mysql`）
- **运行时切换**：`POST /api/db/switch`，重建适配器并重新初始化（用于演示/排查）
- **连接管理**：`connection.ts` 维护全局单例 `adapter`，`switchDbType()` 先关闭再重建

---

## 3. MySQL → SQLite 同步

### 同步流程

```
MySQL 源库 ──► 读取表列表 ──► 逐表处理：
                              ├─ 读取源列定义 → MySQL 类型映射为 SQLite 类型
                              ├─ 目标库 CREATE TABLE IF NOT EXISTS
                              ├─ DELETE 目标表旧数据
                              └─ 分批 INSERT（事务包裹）
                              ──► 写入 sys_db_sync_log
```

### 类型映射

| MySQL | SQLite |
|---|---|
| `int/tinyint/smallint/mediumint/bigint` | `INTEGER` |
| `float/double/decimal` | `REAL` |
| 其他（varchar/text/...） | `TEXT` |

### 同步策略
- **结构**：仅创建缺失表，不修改已有表结构（避免破坏数据）
- **数据**：目标表先 `DELETE` 再 `INSERT`（全量覆盖）
- **事务**：每表一个事务，单表失败不影响其他表（`partial` 状态）
- **排除**：`sys_schema_migration` 迁移表不同步

---

## 4. 系统更新引擎

### 4.1 多应用模型

平台支持**注册管理多个系统/服务**（内部 + 外部），每个应用记录于 `sys_app` 表，携带：
- **类型**：`nodejs` / `python`（决定命令模板与流程）
- **范围**：`internal`（本平台自身）/ `external`（外部系统）
- **仓库**：GitHub 地址、分支、部署目录
- **命令**：安装命令、构建命令（可禁用）、PM2 应用名、Python 入口文件/解释器
- **部署排除**：glob 规则

更新任务**针对选中的应用**执行，一次只跑一个（全局状态单例带 `appId/appName/appType`）。

### 4.2 类型命令模板

| 类型 | 安装 | 构建 | PM2 重启 |
|---|---|---|---|
| Node.js | `npm install` | `npm run build`（默认启用） | `pm2 restart <name> --update-env` |
| Python | `pip install -r requirements.txt` | 无（默认禁用） | `pm2 restart <name>`（首次 `pm2 start app.py --name <name> --interpreter python`） |

模板可通过 `GET /api/apps/templates` 获取，前端新建应用时按类型自动套用。

### 4.3 状态机

```
idle ──run──► starting ──► downloading ──► deploying ──► installing
                                                              │
                                                              ▼
                  done ◄── restarting ◄── building ◄─────────

任意阶段失败 ──► error
stop 模式 ──► stopping ──► done
```

### 4.4 七种模式

| 模式 | 流程 |
|---|---|
| `full` | 下载→部署→安装→构建→重启（一键更新） |
| `download` | 仅从仓库下载并解压源码包 |
| `deploy` | 仅部署最新源码包到应用目录 |
| `install` | 仅执行应用安装命令 |
| `build` | 仅执行构建命令（需应用启用构建） |
| `restart` | 仅 PM2 重启该应用 |
| `stop` | 仅 PM2 停止该应用 |

### 4.5 关键技术点

- **仓库下载**：`codeload.github.com` zip 流式下载，支持 GitHub Token、**HTTP/HTTPS 代理**、**跳过 SSL 证书校验**（内网 GitLab/自签证书）、master 分支兜底、3 次重试
- **部署过滤**：每应用独立 glob 规则排除 `node_modules`/`__pycache__`/`venv`/`.env` 等
- **PM2 自重启**：`spawn(..., { detached: true }).unref()` + 延迟 1 秒，使 API 能在自身被重启前返回响应
- **进度轮询**：前端每 2 秒拉取 `status`，环形日志缓冲区（最多 1200 行）
- **部署包保留**：按 `应用名_时间_分支` 命名，按时间排序保留最近 N 份（默认 3）

### 4.6 配置分层

- **全局配置**（`update-config.json`）：GitHub Token、网络代理、SSL 校验、包保留份数 —— 跨应用通用
- **应用配置**（`sys_app` 表）：仓库、分支、部署目录、安装/构建命令、PM2 名 —— 按应用独立

---

## 5. 认证机制

- **登录**：`POST /api/auth/login` 校验账号密码（scrypt 哈希），返回 HMAC 签名 token
- **Token**：`base64url(payload).hmacSignature`，24 小过期，无状态校验
- **密码哈希**：`scrypt$<rounds>$<salt>$<derived>`，使用 Node 内置 `crypto.scryptSync`（无需 bcrypt 原生依赖）
- **中间件**：`requireAuth` 解析 token 挂载到 `req.admin`；`requireSuperAdmin` 校验超管角色

---

## 6. 前端模块划分

系统管理采用**多页面**结构，每项功能独立页面，侧边栏导航：

| 页面 | 路由 | 功能 |
|---|---|---|
| 仪表盘 | `/dashboard` | 系统概览、CPU/内存/运行时长监控（5 秒刷新） |
| 系统更新 | `/system-update` | 选择目标应用，更新引擎控制台 + 实时日志 + 全局配置(代理/SSL) |
| 应用管理 | `/apps` | 注册/编辑被管理系统（nodejs/python），配置仓库与命令 |
| 数据库管理 | `/database` | 类型切换、MySQL→SQLite 同步、表结构浏览 |
| 系统参数 | `/params` | key/value 配置 CRUD |
| 操作日志 | `/logs` | 审计流水查询（按类型/用户/时间） |
| 个人中心 | `/profile` | 账号信息、修改密码 |

### 视觉设计
- 主色调：靛蓝-紫色渐变（`#6366f1 → #8b5cf6`）
- 卡片化布局，圆角 12px，柔和阴影
- 登录页：全屏渐变背景 + 磨砂玻璃卡片 + 动态光斑
- 终端日志：深色面板（`#0f172a`）+ 等宽字体 + 错误/警告着色
- 状态点：脉冲动画反馈运行状态

---

## 7. 安全设计

- SQL 全部使用**预处理语句 + 参数绑定**，杜绝注入
- 密码 scrypt 加盐哈希存储，不明文
- Token HMAC 签名，防篡改
- 管理接口全部经 `requireAuth`
- CORS 白名单可配置
- 关键操作（更新/切换/同步/改密）全部写入审计日志

---

## 8. 部署模型

```
开发: vite dev (:5174) + tsx watch server (:1100)
生产: vite build → server/dist → Express 单端口 (:1100) 托管 SPA + API
进程: pm2 start ecosystem.config.cjs (tsx 直接运行 TS)
```

生产环境单端口同时服务 API 与前端 SPA，SPA 兜底路由 `GET *` 返回 `index.html`。
