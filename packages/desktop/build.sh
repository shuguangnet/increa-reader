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

set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT_DIR"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Install desktop dependencies
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Install Tauri CLI if not present
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo not found. Install from https://rustup.rs"
    exit 1
fi

if ! command -v tauri &> /dev/null && ! npx tauri --version &> /dev/null; then
    echo "📦 Installing Tauri CLI..."
    cargo install tauri-cli
fi

cd "$ROOT_DIR"

case "${1:-build}" in
    dev)
        echo "🚀 Starting development mode..."
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
    clean)
        echo "🧹 Cleaning build artifacts..."
        cd "$DESKTOP_DIR"
        cargo clean
        rm -rf src-tauri/target
        echo "✅ Clean complete."
        ;;
    *)
        echo "Usage: $0 {dev|build|clean}"
        exit 1
        ;;
esac