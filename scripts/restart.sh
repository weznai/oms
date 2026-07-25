#!/usr/bin/env bash
# 运营管理平台 - 编译并重启 (Linux/macOS)
# 用法: bash scripts/restart.sh
# 自定义端口: PORT=1200 bash scripts/restart.sh
set -e

PORT="${PORT:-1100}"
APP_NAME="oms-ops"

echo "========== 运营管理平台 编译并重启 (端口 $PORT) =========="

# 1. 构建前端
echo ">> 构建前端..."
npm run build

# 2. 停止 PM2 进程（避免 autorestart 干扰端口释放）
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo ">> 停止 PM2 进程 $APP_NAME..."
  pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
fi

# 3. 释放 1100 端口（kill 残留进程）
PIDS=""
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
fi
if [ -n "$PIDS" ]; then
  echo ">> 释放端口 $PORT (kill $(echo "$PIDS" | tr '\n' ' '))..."
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  sleep 1
else
  echo "[OK] 端口 $PORT 空闲"
fi

# 4. 启动服务
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo ">> 重启 PM2 进程 $APP_NAME..."
    pm2 restart "$APP_NAME"
  else
    echo ">> 启动 PM2 进程 $APP_NAME..."
    pm2 start ecosystem.config.cjs
  fi
  pm2 status
  echo ">> 日志: pm2 logs $APP_NAME"
else
  echo "[!] 未安装 PM2，回退直接启动: npm start"
  npm start
fi

echo "========== 完成，访问 http://localhost:$PORT =========="
