# 运营管理平台 - 编译并重启 (Windows PowerShell)
# 用法: .\scripts\restart.ps1
# 自定义端口: $env:PORT=1200; .\scripts\restart.ps1
$ErrorActionPreference = 'Stop'

$Port = if ($env:PORT) { [int]$env:PORT } else { 1100 }
$AppName = 'oms-ops'

Write-Host "========== 运营管理平台 编译并重启 (端口 $Port) ==========" -ForegroundColor Cyan

# 1. 构建前端
Write-Host ">> 构建前端..." -ForegroundColor Yellow
npm run build
if (-not $?) { Write-Host "[X] 构建失败" -ForegroundColor Red; exit 1 }

# 2. 停止 PM2 进程
$hasPm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($hasPm2) {
    $running = $null
    try { $running = (pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq $AppName } } catch { }
    if ($running) {
        Write-Host ">> 停止 PM2 进程 $AppName..." -ForegroundColor Yellow
        pm2 stop $AppName 2>$null | Out-Null
    }
}

# 3. 释放 1100 端口（kill 残留进程）
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $killPids = $conns.OwningProcess | Select-Object -Unique
    Write-Host ">> 释放端口 $Port (kill PID: $($killPids -join ', '))..." -ForegroundColor Yellow
    foreach ($p in $killPids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
} else {
    Write-Host "[OK] 端口 $Port 空闲" -ForegroundColor Green
}

# 4. 启动服务
if ($hasPm2) {
    $exists = $null
    try { $exists = (pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq $AppName } } catch { }
    if ($exists) {
        Write-Host ">> 重启 PM2 进程 $AppName..." -ForegroundColor Yellow
        pm2 restart $AppName
    } else {
        Write-Host ">> 启动 PM2 进程 $AppName..." -ForegroundColor Yellow
        pm2 start ecosystem.config.cjs
    }
    pm2 status
    Write-Host ">> 日志: pm2 logs $AppName" -ForegroundColor DarkGray
} else {
    Write-Host "[!] 未安装 PM2，回退直接启动: npm start" -ForegroundColor DarkYellow
    npm start
}

Write-Host "========== 完成，访问 http://localhost:$Port ==========" -ForegroundColor Green
