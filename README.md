# 运营管理平台 (OMS Ops Platform)

基于 **Node.js + Vue 3 + TypeScript** 的运营管理平台，首个模块为**系统管理**。提供系统发布、更新、重启、停止等运维能力，支持 SQLite（默认）/ MySQL 双数据库切换与 MySQL → SQLite 同步。

> 参考实现：`D:\work\openCode\fund` 后台管理系统更新模块

## 快速开始

```bash
npm install            # 安装依赖（Node ≥ 22.5，推荐 24）
cp .env.example .env   # 配置环境变量
npm run db:init        # 初始化数据库
npm run dev:full       # 开发模式（前端 :5174 / 后端 :1100）
```

默认账号：`admin` / `admin123`

## 生产部署

```bash
npm run build          # 构建前端到 server/dist
npm run pm2:start      # PM2 启动（单端口 1100 托管 SPA + API）
```

## 技术栈

Vue 3.4 · Element Plus 2.7 · Pinia · Express 4 · TypeScript · SQLite(`node:sqlite`) / MySQL(`mysql2`) · PM2

## 系统管理模块（多页面）

| 页面 | 功能 |
|---|---|
| 仪表盘 | 系统概览、CPU/内存/运行时长监控 |
| 系统更新 | 选择目标应用，GitHub 拉取→部署→安装→构建→重启/停止，实时日志 |
| 应用管理 | 注册/编辑被管理系统（Node.js/Python 类型），配置仓库与命令模板 |
| 数据库管理 | SQLite/MySQL 切换、MySQL→SQLite 同步、表浏览 |
| 系统参数 | key/value 配置维护 |
| 操作日志 | 审计流水查询 |

> 支持管理**多个内外部系统**：Node.js（npm install + build）与 Python（pip install + PM2 `--interpreter python`）使用不同命令模板。GitHub 下载支持 https + 代理 + 可选跳过 SSL 校验。

## 文档

详细文档位于 [`docs/`](./docs)：[架构设计](./docs/design.md) · [API 文档](./docs/api.md) · [数据库设计](./docs/database.md) · [SQL 脚本](./docs/sql/)
