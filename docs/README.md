# 运营管理平台 (OSS Ops Platform)

基于 **Node.js + Vue 3** 的运营管理平台，首个模块为**系统管理**，提供系统发布、更新、重启、停止等运维能力，以及数据库（SQLite / MySQL）切换与同步。

参考实现：`D:\work\openCode\fund` 后台管理的系统更新模块。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vue 3.4 + TypeScript + Vite 5 | 组合式 API、`<script setup>` |
| UI 组件 | Element Plus 2.7 | 后台管理风格，按需自动导入 |
| 状态/路由 | Pinia + Vue Router 4 | |
| 后端 | Node.js + Express 4 + TypeScript | tsx 运行时，无需编译 |
| 数据库 | SQLite（`node:sqlite` 内置）/ MySQL（mysql2） | 双库适配，配置切换 |
| 进程管理 | PM2 | 一键重启/停止 |

## 核心特性

- **数据库双模**：SQLite（零配置、文件型，默认优先）+ MySQL（多实例/高并发），通过 `.env` 的 `DB_TYPE` 切换
- **MySQL → SQLite 同步**：一键将 MySQL 业务数据全量同步到本地 SQLite，支持离线/备份
- **系统更新引擎**：GitHub 源码拉取 → 部署 → 依赖安装 → 构建 → PM2 重启/停止，完整运维流程
- **实时状态**：仪表盘监控 CPU/内存/运行时长，更新任务进度轮询
- **审计日志**：记录登录、更新、数据变更等全部关键操作
- **零原生编译**：SQLite 使用 Node 22.5+ 内置 `node:sqlite`，无需 Visual Studio 工具链

## 目录结构

```
oss/
├── server/                 # 后端
│   ├── config/             # 配置加载
│   ├── db/                 # 数据访问层（适配器 + 仓储 + 迁移）
│   ├── middleware/         # 认证中间件
│   ├── routes/             # 路由（auth/system/update/db/param/log）
│   ├── services/           # 业务服务（更新引擎/系统信息/DB同步）
│   ├── utils/              # 工具（加密/响应/日志/token/glob）
│   └── index.ts            # 入口
├── src/                    # 前端
│   ├── api/                # API 模块
│   ├── layout/             # 主布局（侧边栏+顶栏）
│   ├── router/             # 路由
│   ├── stores/             # Pinia
│   ├── styles/             # 全局样式
│   ├── utils/              # http 封装
│   └── views/              # 页面（登录/仪表盘/更新/数据库/参数/日志/个人中心）
├── docs/                   # 文档
│   ├── README.md           # 本文件
│   ├── design.md           # 架构设计
│   ├── api.md              # API 接口
│   ├── database.md         # 数据库设计
│   └── sql/                # 建表脚本（SQLite/MySQL）
├── scripts/                # 脚本（DB 初始化/同步）
├── ecosystem.config.cjs    # PM2 配置
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

> 要求 Node.js ≥ 22.5（推荐 24，使用内置 `node:sqlite`，无需原生编译）

### 2. 配置环境变量

```bash
cp .env.example .env
# 按需修改端口、数据库类型、管理员账号、GitHub 更新配置
```

### 3. 初始化数据库

```bash
npm run db:init
```

### 4. 开发模式（前后端热更新）

```bash
npm run dev:full
```

- 前端：http://localhost:5174
- 后端：http://localhost:1100

### 5. 生产模式

```bash
npm run build          # 构建前端到 server/dist
npm start              # 启动后端（同时托管前端 SPA）
# 或 PM2
npm run pm2:start
```

默认账号：`admin` / `admin123`（首次登录后请修改）

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev:full` | 前后端同时开发 |
| `npm run server` | 仅后端（热更新） |
| `npm run build` | 构建前端 |
| `npm run db:init` | 初始化数据库表与种子数据 |
| `npm run db:sync` | 手动执行 MySQL → SQLite 同步 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run pm2:start` | PM2 启动（生产） |
| `npm run pm2:restart` | PM2 重启 |

## 文档导航

- [架构设计](./design.md)
- [API 接口文档](./api.md)
- [数据库设计](./database.md)
- [SQL 脚本](./sql/schema-sqlite.sql) / [MySQL 版本](./sql/schema-mysql.sql)
