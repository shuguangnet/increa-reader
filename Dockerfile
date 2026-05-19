# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/server/package.json ./packages/server/
RUN corepack enable && pnpm install
COPY . .
RUN pnpm --filter @increa-reader/ui build

# Stage 2: Python backend
FROM python:3.13-slim AS backend
WORKDIR /app
COPY packages/server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/server/ .
COPY --from=frontend-builder /app/packages/ui/dist ./static
EXPOSE 3002
CMD ["python", "server.py"]
