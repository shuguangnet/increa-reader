#!/bin/bash
# Increa Reader 一键部署脚本
# 在宿主机上运行: curl -fsSL https://raw.githubusercontent.com/shuguangnet/increa-reader/main/deploy.sh | bash
# 或者: git clone https://github.com/shuguangnet/increa-reader.git && cd increa-reader && ./deploy.sh

set -e

BACKEND_PORT=${BACKEND_PORT:-3002}
FRONTEND_PORT=${FRONTEND_PORT:-5177}
HOST=${HOST:-0.0.0.0}
REPO_DIR=$(pwd)

echo "🚀 Increa Reader 一键部署"
echo "   后端端口: $BACKEND_PORT"
echo "   前端端口: $FRONTEND_PORT"
echo "   绑定地址: $HOST"
echo ""

# 1. 克隆仓库（如果不在项目目录中）
if [ ! -d "packages/server" ]; then
    echo "📥 克隆仓库..."
    git clone https://github.com/shuguangnet/increa-reader.git /tmp/increa-reader
    cd /tmp/increa-reader
    REPO_DIR=/tmp/increa-reader
fi

# 2. 配置 .env
mkdir -p workspace
if [ ! -f packages/server/.env ]; then
    cat > packages/server/.env << EOF
INCREA_REPO="$REPO_DIR/workspace"
PORT=$BACKEND_PORT
ANTHROPIC_API_KEY=""
EOF
    echo "✅ 已创建 packages/server/.env"
fi

# 3. 配置 CORS（允许所有来源）
python3 -c "
import re
path = 'packages/server/increa_reader/main.py'
content = open(path).read()
content = re.sub(r'allow_origins=\[.*?\]', 'allow_origins=[\"*\"]', content)
content = content.replace('allow_credentials=True', 'allow_credentials=False')
open(path, 'w').write(content)
print('✅ CORS 配置完成')
" 2>/dev/null || echo "⚠️  请手动配置 CORS"

# 4. 配置 Vite
node -e "
const fs = require('fs');
const path = 'packages/ui/vite.config.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/port:\s*\d+/, 'port: $FRONTEND_PORT');
if (!content.includes('host:')) {
    content = content.replace('server: {', 'server: {\\n    host: \\\"0.0.0.0\\\",');
} else {
    content = content.replace(/host:\s*['\"][^'\"]+['\"]/, 'host: \"0.0.0.0\"');
}
content = content.replace(/target:\s*['\"]http:\/\/[^:]+:(\d+)['\"]/, 'target: \"http://localhost:$BACKEND_PORT\"');
fs.writeFileSync(path, content);
console.log('✅ Vite 配置完成');
" 2>/dev/null || echo "⚠️  需要安装 Node.js"

# 5. 安装前端依赖
echo "📦 安装前端依赖..."
npm install -g pnpm 2>/dev/null || true
pnpm install 2>/dev/null || npm install

# 6. 安装 Python 依赖
echo "📦 安装后端依赖..."
if command -v python3 &> /dev/null; then
    python3 -m venv packages/server/.venv 2>/dev/null || true
    if [ -f packages/server/.venv/bin/pip ]; then
        packages/server/.venv/bin/pip install -r packages/server/requirements.txt
        PYTHON="packages/server/.venv/bin/python"
    else
        pip3 install --break-system-packages -r packages/server/requirements.txt 2>/dev/null || \
        pip3 install -r packages/server/requirements.txt 2>/dev/null
        PYTHON="python3"
    fi
else
    echo "❌ 需要安装 Python 3.10+"
    exit 1
fi

# 启动后端
echo "🚀 启动后端 (端口 $BACKEND_PORT)..."
PORT=$BACKEND_PORT $PYTHON packages/server/server.py &

# 8. 等待后端就绪
echo "⏳ 等待后端就绪..."
for _ in $(seq 1 30); do
    if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
        echo "   ✅ 后端就绪!"
        break
    fi
    sleep 1
done

# 9. 启动前端
echo "🚀 启动前端 (端口 $FRONTEND_PORT)..."
pnpm --filter @increa-reader/ui dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" &

echo ""
echo "✨ Increa Reader 已启动!"
echo ""
echo "   🌐 前端: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):$FRONTEND_PORT"
echo "   🔌 后端: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):$BACKEND_PORT"
echo "   📡 API:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):$BACKEND_PORT/api"
echo ""
echo "按 Ctrl+C 停止所有服务"

wait