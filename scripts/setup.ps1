# 运营管理平台 - Windows 首次启动脚本 (PowerShell)
# 用法: .\scripts\setup.ps1
$ErrorActionPreference = 'Stop'

Write-Host "========== 运营管理平台 首次部署 ==========" -ForegroundColor Cyan

# 1. 检查 Node 版本
try {
    $nodeVer = [int]((node -v) -replace 'v','' -split '\.')[0]
} catch {
    Write-Host "[X] 未检测到 Node.js，请先安装 Node >= 22.5" -ForegroundColor Red
    exit 1
}
if ($nodeVer -lt 22) {
    Write-Host "[X] 需要 Node.js >= 22.5（当前 v$nodeVer）" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node $(node -v)" -ForegroundColor Green

# 2. 安装依赖
if (-not (Test-Path node_modules)) {
    Write-Host ">> 安装依赖..." -ForegroundColor Yellow
    npm install --no-audit --no-fund
} else {
    Write-Host "[OK] node_modules 已存在，跳过" -ForegroundColor Green
}

# 3. 配置环境变量
if (-not (Test-Path .env)) {
    Write-Host ">> 生成 .env..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "[提示] 请编辑 .env 修改端口/数据库/管理员密码等" -ForegroundColor DarkYellow
} else {
    Write-Host "[OK] .env 已存在" -ForegroundColor Green
}

# 4. 初始化数据库
Write-Host ">> 初始化数据库..." -ForegroundColor Yellow
node --import tsx scripts/init-db.ts

# 5. 构建前端
Write-Host ">> 构建前端..." -ForegroundColor Yellow
npm run build

# 6. 启动方式选择
Write-Host ""
Write-Host "========== 部署完成 ==========" -ForegroundColor Cyan
Write-Host "开发模式:   npm run dev:full        (前端 :5174 / 后端 :1100)"
Write-Host "生产直接跑: npm start               (单端口 :1100)"
Write-Host "PM2 托管:   npm run pm2:start       (守护进程，推荐生产)"
Write-Host "  首次用 PM2 需先安装: npm i -g pm2"
Write-Host ""
$choice = Read-Host "是否现在用 PM2 启动? (y/N)"
if ($choice -eq 'y' -or $choice -eq 'Y') {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        Write-Host ">> 安装 PM2..." -ForegroundColor Yellow
        npm i -g pm2
    }
    npm run pm2:start
    pm2 status
    Write-Host ">> 访问: http://localhost:1100  (默认账号 admin / admin123)" -ForegroundColor Green
} else {
    Write-Host ">> 可手动执行: npm start  或  npm run pm2:start"
}
