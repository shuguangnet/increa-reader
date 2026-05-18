#!/bin/bash
# Increa Reader 启动脚本
# 用法: ./start.sh
# 后端: http://localhost:3002
# 前端: http://localhost:5177

set -e
cd "$(dirname "$0")"

# 默认端口
BACKEND_PORT=${BACKEND_PORT:-3002}
FRONTEND_PORT=${FRONTEND_PORT:-5177}
HOST=${HOST:-0.0.0.0}

echo "🔧 Increa Reader 启动中..."
echo "   后端端口: $BACKEND_PORT"
echo "   前端端口: $FRONTEND_PORT"
echo "   绑定地址: $HOST"

# 检查 .env 文件
if [ ! -f packages/server/.env ]; then
  echo "⚠️  未找到 packages/server/.env，使用默认配置"
  mkdir -p workspace
  cat > packages/server/.env << 'ENVEOF'
INCREA_REPO="$(pwd)/workspace"
PORT=3002
ANTHROPIC_API_KEY=""
ENVEOF
fi

# 创建 workspace 目录
mkdir -p workspace

# 安装前端依赖
echo "📦 安装前端依赖..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 检查 Python 虚拟环境
if [ -d packages/server/.venv ]; then
  PYTHON="packages/server/.venv/bin/python"
  PIP="packages/server/.venv/bin/pip"
else
  PYTHON="python3"
  PIP="pip3"
fi

# 安装后端依赖
echo "📦 安装后端依赖..."
$PIP install -r packages/server/requirements.txt 2>/dev/null || $PIP install --break-system-packages -r packages/server/requirements.txt

# 更新 vite 配置端口和 host
echo "🔧 配置前端..."
node -e "
const fs = require('fs');
const path = 'packages/ui/vite.config.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/port:\s*\d+/, 'port: $FRONTEND_PORT');
content = content.replace(/host:\s*['\"][^'\"]+['\"]/, \"host: '$HOST'\");
if (!content.includes('host:')) {
  content = content.replace('server: {', 'server: {\\n    host: \\\"$HOST\\\",');
}
content = content.replace(/target:\s*['\"]http:\/\/[^:]+:(\d+)['\"]/, 'target: \"http://localhost:$BACKEND_PORT\"');
fs.writeFileSync(path, content);
"

# 更新后端 CORS
echo "🔧 配置后端 CORS..."
python3 -c "
import re
path = 'packages/server/increa_reader/main.py'
content = open(path).read()
# Allow all origins for dev
content = re.sub(r'allow_origins=\[.*?\]', 'allow_origins=[\"*\"]', content)
content = content.replace('allow_credentials=True', 'allow_credentials=False')
open(path, 'w').write(content)
"

# 启动后端
echo "🚀 启动后端 (端口 $BACKEND_PORT)..."
PORT=$BACKEND_PORT $PYTHON packages/server/server.py &
BACKEND_PID=$!
echo "   后端 PID: $BACKEND_PID"

# 等待后端就绪
echo "⏳ 等待后端就绪..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    echo "   ✅ 后端就绪!"
    break
  fi
  sleep 1
done

# 启动前端
echo "🚀 启动前端 (端口 $FRONTEND_PORT)..."
npx pnpm --filter @increa-reader/ui dev -- --host $HOST --port $FRONTEND_PORT &
FRONTEND_PID=$!
echo "   前端 PID: $FRONTEND_PID"

echo ""
echo "✨ Increa Reader 已启动!"
echo "   前端: http://localhost:$FRONTEND_PORT"
echo "   后端: http://localhost:$BACKEND_PORT"
echo "   API:  http://localhost:$BACKEND_PORT/api"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待任一进程退出
wait