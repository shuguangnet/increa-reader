#!/bin/bash
# Increa Reader - Desktop Build Script
# 
# Prerequisites:
#   1. Install Rust: https://rustup.rs
#   2. Install system dependencies:
#      - Linux: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
#      - macOS: xcode-select --install
#      - Windows: No extra deps needed
#   3. Install frontend deps: pnpm install
#
# Usage:
#   ./build.sh          - Build production desktop app
#   ./build.sh dev      - Run in development mode
#   ./build.sh clean    - Clean build artifacts

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_BUILD_SCRIPT="$ROOT_DIR/packages/scripts/build_sidecar.sh"
PNPM_CMD="${PNPM_CMD:-}"

cd "$ROOT_DIR"

build_sidecar() {
    if [[ "${INCREA_SKIP_SIDECAR_BUILD:-0}" == "1" ]]; then
        echo "⏭️  Skipping sidecar build because INCREA_SKIP_SIDECAR_BUILD=1"
        return 0
    fi

    if [[ ! -x "$SIDECAR_BUILD_SCRIPT" ]]; then
        echo "❌ Sidecar build script not found: $SIDECAR_BUILD_SCRIPT"
        exit 1
    fi

    echo "🐍 Building Python sidecar for current platform..."
    "$SIDECAR_BUILD_SCRIPT"
}

resolve_pnpm() {
    if [[ -n "$PNPM_CMD" ]]; then
        return 0
    fi

    if command -v pnpm >/dev/null 2>&1; then
        PNPM_CMD="pnpm"
        return 0
    fi

    local corepack_pnpm
    corepack_pnpm="$(python3 - <<'PY'
from pathlib import Path
root = Path.home() / '.cache/node/corepack/pnpm/10.17.1/bin/pnpm.cjs'
print(root if root.exists() else '')
PY
)"

    if [[ -n "$corepack_pnpm" ]]; then
        PNPM_CMD="node $corepack_pnpm"
        return 0
    fi

    echo "❌ pnpm not found. Install pnpm or prepare corepack pnpm@10.17.1 first."
    exit 1
}

pnpm_run() {
    resolve_pnpm
    bash -lc "$PNPM_CMD $*"
}

require_cargo() {
    if ! command -v cargo &> /dev/null; then
        echo "❌ Rust/Cargo not found. Install from https://rustup.rs"
        exit 1
    fi
}

# ── Install frontend dependencies ──────────────────────────────────────
echo "📦 Installing frontend dependencies..."
pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"

# ── Install desktop package dependencies ──────────────────────────────
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"

# ── Ensure icons exist ─────────────────────────────────────────────────
ICONS_DIR="$DESKTOP_DIR/src-tauri/icons"
if [ ! -f "$ICONS_DIR/icon.png" ]; then
    echo "⚠️  Warning: Tauri icons not found at $ICONS_DIR"
    echo "   Run 'npx tauri icon' to generate proper icons from a source image."
    echo "   Placeholder icons are present for development builds."
fi

cd "$ROOT_DIR"

# ── Command dispatcher ────────────────────────────────────────────────
case "${1:-build}" in
    dev)
        echo "🚀 Starting development mode..."
        echo "   Frontend dev server will start on http://localhost:5177"
        echo "   Tauri window will open automatically."
        require_cargo
        build_sidecar
        cd "$DESKTOP_DIR"
        npx tauri dev
        ;;
    build)
        echo "🔨 Building desktop app..."
        require_cargo
        build_sidecar
        cd "$DESKTOP_DIR"
        npx tauri build
        echo ""
        echo "✅ Build complete! Check src-tauri/target/release/bundle/ for installers."
        ;;
    build:debug)
        echo "🔨 Building desktop app (debug)..."
        require_cargo
        build_sidecar
        cd "$DESKTOP_DIR"
        npx tauri build --debug
        echo ""
        echo "✅ Debug build complete! Check src-tauri/target/debug/bundle/"
        ;;
    clean)
        echo "🧹 Cleaning build artifacts..."
        cd "$DESKTOP_DIR"
        cargo clean 2>/dev/null || true
        rm -rf src-tauri/target src-tauri/gen
        echo "✅ Clean complete."
        ;;
    *)
        echo "Usage: $0 {dev|build|build:debug|clean}"
        exit 1
        ;;
esac