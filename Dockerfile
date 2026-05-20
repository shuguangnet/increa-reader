# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/server/package.json ./packages/server/
RUN corepack enable && pnpm install --frozen-lockfile
COPY packages/ui/ ./packages/ui/
RUN pnpm --filter @increa-reader/ui build

# Stage 2: Python backend
FROM python:3.13-slim AS backend
WORKDIR /app

# Create non-root user
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

# Install Python dependencies
COPY packages/server/requirements.txt ./packages/server/requirements.txt
RUN pip install --no-cache-dir -r packages/server/requirements.txt

# Copy server code
COPY packages/server/increa_reader/ ./packages/server/increa_reader/
COPY packages/server/server.py ./packages/server/server.py
COPY packages/server/pdf_reader_mcp.py ./packages/server/pdf_reader_mcp.py
COPY packages/server/sidecar_entry.py ./packages/server/sidecar_entry.py

# Copy frontend build output
COPY --from=frontend-builder /app/packages/ui/dist ./packages/ui/dist

# Set environment variables
ENV PORT=3000
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/api/workspace/tree')" || exit 1

EXPOSE 3000
USER appuser
CMD ["python", "packages/server/server.py"]