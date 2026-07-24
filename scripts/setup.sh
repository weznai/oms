#!/usr/bin/env bash
# 运营管理平台 - Linux/macOS 首次启动脚本
# 用法: bash scripts/setup.sh
set -e

echo "========== 运营管理平台 首次部署 =========="

# 1. 检查 Node 版本
NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 22 ]; then
  echo "[X] 需要 Node.js >= 22.5（当前: $(node -v 2>/dev/null || 未安装)）"
  echo "    建议: nvm install 24 && nvm use 24"
  exit 1
fi
echo "[OK] Node $(node -v)"

# 2. 安装依赖（含跨平台检测：node_modules 可能从 Windows 复制过来）
need_reinstall=false
if [ -d node_modules ]; then
  # 当前平台对应的 esbuild 原生包名
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)   ESB_PKG="linux-x64" ;;
    Linux-aarch64)  ESB_PKG="linux-arm64" ;;
    Darwin-x86_64)  ESB_PKG="darwin-x64" ;;
    Darwin-arm64)   ESB_PKG="darwin-arm64" ;;
    *) ESB_PKG="" ;;
  esac
  if [ -n "$ESB_PKG" ] && [ ! -d "node_modules/@esbuild/$ESB_PKG" ]; then
    echo "[!] node_modules 来自其他平台（缺 @esbuild/$ESB_PKG），重新安装..."
    need_reinstall=true
  fi
fi

if [ ! -d node_modules ] || [ "$need_reinstall" = true ]; then
  echo ">> 安装依赖..."
  rm -rf node_modules package-lock.json
  npm install --no-audit --no-fund
else
  echo "[OK] node_modules 已存在且平台匹配，跳过"
fi

# 3. 配置环境变量
if [ ! -f .env ]; then
  echo ">> 生成 .env..."
  cp .env.example .env
  echo "[提示] 请编辑 .env 修改端口/数据库/管理员密码等"
else
  echo "[OK] .env 已存在"
fi

# 4. 初始化数据库
echo ">> 初始化数据库..."
node --import tsx scripts/init-db.ts

# 5. 构建前端
echo ">> 构建前端..."
npm run build

# 6. 启动方式选择
echo ""
echo "========== 部署完成 =========="
echo "开发模式:   npm run dev:full        (前端 :5174 / 后端 :1100)"
echo "生产直接跑: npm start               (单端口 :1100)"
echo "PM2 托管:   npm run pm2:start       (守护进程，推荐生产)"
echo "  首次用 PM2 需先安装: npm i -g pm2"
echo ""
read -p "是否现在用 PM2 启动? (y/N): " choice
if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
  if ! command -v pm2 >/dev/null 2>&1; then
    echo ">> 安装 PM2..."
    npm i -g pm2
  fi
  npm run pm2:start
  pm2 status
  echo ">> 访问: http://localhost:1100  (默认账号 admin / admin123)"
else
  echo ">> 可手动执行: npm start  或  npm run pm2:start"
fi
