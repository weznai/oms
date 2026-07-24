# API 接口文档

所有接口前缀 `/api`，响应统一格式：

```json
{ "code": 0, "message": "操作成功", "data": {} }
```

错误时 `code != 0`，`data` 为 `null`。401 表示未登录/token 过期。

除登录外，所有接口需在请求头携带：`Authorization: Bearer <token>`

---

## 1. 认证 `/api/auth`

### POST /auth/login
登录获取 token。

**请求体**
```json
{ "username": "admin", "password": "admin123" }
```
**响应 data**
```json
{
  "token": "xxx.yyy",
  "admin": { "id": 1, "username": "admin", "displayName": "管理员", "role": "super_admin" }
}
```

### POST /auth/logout
退出登录。

### GET /auth/profile
获取当前管理员信息。

**响应 data**
```json
{ "id": 1, "username": "admin", "displayName": "管理员", "role": "super_admin", "lastLoginAt": 1784884851648 }
```

### PUT /auth/password
修改密码。

**请求体**
```json
{ "oldPassword": "admin123", "newPassword": "newpass456" }
```

---

## 2. 系统信息 `/api/system`

### GET /system/info
获取系统运行信息（主机、CPU、内存、运行时长、数据库类型、git 信息等）。

**响应 data（关键字段）**
```json
{
  "hostname": "wzne", "platform": "win32", "arch": "x64",
  "cpus": 16, "cpuModel": "...", "totalMem": 34359738368,
  "usedMem": 17888051200, "memUsagePercent": 52.06,
  "uptime": 123456, "uptimeText": "1天10时17分36秒",
  "processUptime": 600, "processPid": 12345,
  "nodeVersion": "v24.6.0", "dbType": "sqlite",
  "pm2Available": true, "gitAvailable": true,
  "gitBranch": "main", "gitCommit": "a1b2c3d",
  "platformName": "运营管理平台", "platformVersion": "1.0.0"
}
```

### GET /system/tables
获取全部数据表名列表。

---

## 3. 应用管理 `/api/apps`

注册被管理的系统/服务（nodejs/python），配置后可对其发布、更新、重启、停止。

### GET /apps
应用列表。

**响应 data**：应用对象数组，含 `id/name/display_name/type/scope/repo_url/branch/deploy_path/pm2_app_name/port/install_cmd/build_cmd/build_enabled/start_file/interpreter/deploy_excludes/enabled`。

### GET /apps/templates
获取各类型的命令模板。

**响应 data**
```json
{
  "nodejs": { "installCmd": "npm install", "buildCmd": "npm run build", "buildEnabled": true, "deployExcludes": "..." },
  "python": { "installCmd": "pip install -r requirements.txt", "buildCmd": "", "buildEnabled": false, "startFile": "app.py", "interpreter": "python", "deployExcludes": "..." }
}
```

### GET /apps/:id
应用详情。

### POST /apps
新增应用。

**请求体**
```json
{
  "name": "user-service", "display_name": "用户服务", "type": "python", "scope": "external",
  "repo_url": "https://github.com/xxx/user-service", "branch": "main",
  "deploy_path": "/opt/user-service", "pm2_app_name": "user-service", "port": 8000,
  "install_cmd": "pip install -r requirements.txt", "build_cmd": "", "build_enabled": false,
  "start_file": "app.py", "interpreter": "python",
  "deploy_excludes": "__pycache__/**,venv/**", "enabled": true, "remark": ""
}
```

### PUT /apps/:id
编辑应用（请求体同新增）。

### PATCH /apps/:id/enabled
启用/停用应用。

**请求体**：`{ "enabled": true }`

### DELETE /apps/:id
删除应用。

### POST /apps/:id/run
**针对该应用执行任务**（发布/更新/重启/停止）。

**请求体**
```json
{ "mode": "full" }      // full/download/deploy/install/build/restart/stop
```

任务异步执行，前端轮询 `GET /system/update/status` 获取进度（状态含 `appId/appName/appType`）。

---

## 4. 系统更新 `/api/system/update`

### GET /system/update/status
获取当前更新任务状态。

**响应 data**
```json
{
  "appId": 1, "appName": "oss-ops", "appType": "nodejs",
  "stage": "idle",          // idle/starting/downloading/deploying/installing/building/restarting/stopping/done/error
  "running": false, "mode": null, "progress": 0, "message": "空闲",
  "startedAt": null, "finishedAt": null, "error": null,
  "logs": [{ "t": 178..., "level": "info", "text": "..." }]
}
```

### GET /system/update/config
获取全局更新配置（GitHub Token 返回掩码 `******`）。

**响应 data**
```json
{ "githubToken": "******", "proxy": "", "sslVerify": true, "packageKeep": 3 }
```

### POST /system/update/config
保存全局配置。**Token 传 `******` 表示保留原值。**

**请求体**
```json
{
  "githubToken": "ghp_xxx",
  "proxy": "http://127.0.0.1:7890",   // HTTP/HTTPS 代理，留空直连
  "sslVerify": true,                   // false 则跳过 SSL 证书校验（内网/自签证书）
  "packageKeep": 3
}
```

### GET /system/update/test-github?appId=1
测试指定应用的 GitHub 仓库连通性（使用全局配置的 Token/代理/SSL）。

**响应 data**
```json
{ "ok": true, "message": "连接正常 (206)", "statusCode": 206 }
```

### GET /system/update/probe-proxy
探测本地常用代理端口（7890/10809/1080 等）。

### GET /system/update/logs
获取更新日志缓冲。

### POST /system/update/clear-logs
清空日志缓冲。

### GET /system/update/env?app=应用名
获取环境信息（OS、Shell、该应用的部署包列表）。

---

## 5. 数据库管理 `/api/db`

### GET /db/status
当前数据库状态。

**响应 data**
```json
{ "type": "sqlite", "tableCount": 5, "tables": ["sys_admin", "sys_param", "..."] }
```

### POST /db/switch
切换数据库类型（重建适配器并重新初始化）。

**请求体**
```json
{ "type": "mysql" }     // sqlite | mysql
```

### POST /db/sync/mysql-to-sqlite
将 MySQL 数据全量同步到本地 SQLite。

**请求体（tables 留空则同步全部业务表）**
```json
{ "tables": ["sys_admin", "sys_param"] }
```
**响应 data**
```json
{
  "sourceType": "mysql", "targetType": "sqlite",
  "tables": ["sys_admin", "sys_param"],
  "results": [{ "table": "sys_admin", "rows": 1, "status": "ok" }],
  "totalRows": 1, "durationMs": 320, "status": "success",
  "message": "同步完成: 2 张表, 1 行, 耗时 320ms"
}
```

### GET /db/tables/:name
获取指定表的结构与行数。

### GET /db/sync-logs?page=1&pageSize=20
数据库同步历史记录。

---

## 6. 系统参数 `/api/params`

### GET /params
获取全部参数列表。

**响应 data**
```json
[{
  "id": 1, "key": "platform_name", "value": "运营管理平台",
  "remark": "平台名称", "updated_at": 178..., "created_at": 178...
}]
```

### GET /params/:key
获取单个参数。

### POST /params
新增/更新参数（按 key upsert）。

**请求体**
```json
{ "key": "platform_name", "value": "新名称", "remark": "说明" }
```

### DELETE /params/:key
删除参数。

---

## 7. 操作日志 `/api/logs`

### GET /logs
分页查询操作日志（支持筛选）。

**Query 参数**

| 参数 | 说明 |
|---|---|
| page | 页码，默认 1 |
| pageSize | 每页条数，默认 20 |
| action | 操作类型（login/system_update/db_sync/param_save...） |
| username | 用户名 |
| startDate | 起始时间戳 |
| endDate | 结束时间戳 |

**响应 data**
```json
{
  "list": [{
    "id": 1, "username": "admin", "ip": "::1",
    "action": "login", "description": "管理员登录",
    "extra": null, "created_at": 178...
  }],
  "total": 12
}
```

---

## 8. 健康检查

### GET /api/health
无需认证。
```json
{ "code": 0, "message": "ok", "data": { "status": "up", "uptime": 6.07 } }
```
