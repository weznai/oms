#!/usr/bin/env bash
# 运营管理平台 - 编译并重启 (Linux/macOS)
# 用法: bash scripts/restart.sh
set -e

echo "========== 运营管理平台 编译并重启 =========="

# 1. 构建前端
echo ">> 构建前端..."
npm run build

# 2. 重启 PM2（未运行则启动）
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe oss-ops >/dev/null 2>&1; then
    echo ">> 重启 PM2 进程 oss-ops..."
    pm2 restart oss-ops
  else
    echo ">> 未发现 oss-ops 进程，执行 pm2 start..."
    pm2 start ecosystem.config.cjs
  fi
  pm2 status
  echo ">> 日志: pm2 logs oss-ops"
else
  echo "[!] 未安装 PM2，回退直接启动: npm start"
  npm start
fi

echo "========== 完成，访问 http://localhost:1100 =========="
