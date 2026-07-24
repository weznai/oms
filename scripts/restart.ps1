# 运营管理平台 - 编译并重启 (Windows PowerShell)
# 用法: .\scripts\restart.ps1
$ErrorActionPreference = 'Stop'

Write-Host "========== 运营管理平台 编译并重启 ==========" -ForegroundColor Cyan

# 1. 构建前端
Write-Host ">> 构建前端..." -ForegroundColor Yellow
npm run build
if (-not $?) { Write-Host "[X] 构建失败" -ForegroundColor Red; exit 1 }

# 2. 重启 PM2（未运行则启动）
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $running = $null
    try {
        $running = (pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq 'oss-ops' }
    } catch { $running = $null }
    if ($running) {
        Write-Host ">> 重启 PM2 进程 oss-ops..." -ForegroundColor Yellow
        pm2 restart oss-ops
    } else {
        Write-Host ">> 未发现 oss-ops 进程，执行 pm2 start..." -ForegroundColor Yellow
        pm2 start ecosystem.config.cjs
    }
    pm2 status
    Write-Host ">> 日志: pm2 logs oss-ops" -ForegroundColor DarkGray
} else {
    Write-Host "[!] 未安装 PM2，回退直接启动: npm start" -ForegroundColor DarkYellow
    npm start
}

Write-Host "========== 完成，访问 http://localhost:1100 ==========" -ForegroundColor Green
