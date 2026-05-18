#!/bin/bash
# Increa Reader - Deploy script
# Restart frontend and backend services
set -e

echo "=== Increa Reader Deploy ==="

# Kill existing processes
pkill -f "pnpm.*ui dev" 2>/dev/null || true
pkill -f "python.*server.py" 2>/dev/null || true
sleep 2

# Start backend
cd /tmp/increa-reader/packages/server
PORT=3002 python3 server.py &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Start frontend
cd /tmp/increa-reader
npx -y pnpm@9 --filter @increa-reader/ui dev -- --host 0.0.0.0 --port 5177 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

# Wait for backend
for i in $(seq 1 15); do
  if curl -s http://localhost:3002/api/workspace/tree > /dev/null 2>&1; then
    echo "Backend ready!"
    break
  fi
  sleep 1
done

# Wait for frontend
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://localhost:5177/ 2>/dev/null; then
    echo "Frontend ready!"
    break
  fi
  sleep 1
done

echo "=== Deploy Complete ==="
echo "Frontend: http://localhost:5177"
echo "Backend:  http://localhost:3002"