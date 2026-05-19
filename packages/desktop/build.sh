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

cd "$ROOT_DIR"

# ── Install frontend dependencies ──────────────────────────────────────
echo "📦 Installing frontend dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Install desktop package dependencies ──────────────────────────────
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Check Rust toolchain ───────────────────────────────────────────────
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo not found. Install from https://rustup.rs"
    exit 1
fi

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
        cd "$DESKTOP_DIR"
        npx tauri dev
        ;;
    build)
        echo "🔨 Building desktop app..."
        cd "$DESKTOP_DIR"
        npx tauri build
        echo ""
        echo "✅ Build complete! Check src-tauri/target/release/bundle/ for installers."
        ;;
    build:debug)
        echo "🔨 Building desktop app (debug)..."
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