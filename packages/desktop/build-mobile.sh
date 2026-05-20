#!/usr/bin/env bash
# Increa Reader — Mobile (iOS/Android) Build Script
#
# Prerequisites:
#   iOS:
#     - macOS with Xcode 15+
#     - Rust targets: rustup target add aarch64-apple-ios x86_64-apple-ios
#     - cargo-ios: cargo install tauri-cli
#   Android:
#     - Android Studio with NDK 25+
#     - ANDROID_HOME / ANDROID_NDK_HOME env vars set
#     - Rust targets: rustup target add aarch64-linux-android armv7-linux-androideabi
#
# Usage:
#   ./build-mobile.sh ios            — Build iOS release
#   ./build-mobile.sh android        — Build Android release
#   ./build-mobile.sh dev:ios        — iOS dev mode (simulator)
#   ./build-mobile.sh dev:android    — Android dev mode (emulator)
#   ./build-mobile.sh init:ios       — Initialize iOS project (first time only)
#   ./build-mobile.sh init:android   — Initialize Android project (first time only)
#   ./build-mobile.sh icons          — Generate all platform icons
#   ./build-mobile.sh all            — Build both iOS + Android
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT_DIR"

# ── Install frontend dependencies ────────────────────────────
echo "📦 Installing frontend dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Install desktop package dependencies ─────────────────────
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Command dispatcher ───────────────────────────────────────
case "${1:-help}" in
  init:ios)
    echo "🔧 Initializing iOS project..."
    cd "$DESKTOP_DIR"
    npx tauri ios init
    echo "✅ iOS project initialized. Check src-tauri/gen/apple/ for the Xcode project."
    ;;
  init:android)
    echo "🔧 Initializing Android project..."
    cd "$DESKTOP_DIR"
    npx tauri android init
    echo "✅ Android project initialized. Check src-tauri/gen/android/ for the Gradle project."
    ;;
  ios)
    echo "📱 Building iOS release..."
    cd "$DESKTOP_DIR"
    npx tauri ios build --release
    echo ""
    echo "✅ iOS build complete! IPA in src-tauri/target/ios/release/"
    ;;
  android)
    echo "📱 Building Android release..."
    cd "$DESKTOP_DIR"
    npx tauri android build --release
    echo ""
    echo "✅ Android build complete! APK/AAB in src-tauri/target/android/release/"
    ;;
  dev:ios)
    echo "📱 Starting iOS dev server (simulator)..."
    cd "$DESKTOP_DIR"
    npx tauri ios dev
    ;;
  dev:android)
    echo "📱 Starting Android dev server (emulator)..."
    cd "$DESKTOP_DIR"
    npx tauri android dev
    ;;
  icons)
    echo "🎨 Generating all platform icons from source..."
    cd "$DESKTOP_DIR"
    if [ ! -f "src-tauri/icons/icon.png" ]; then
      echo "❌ No source icon found at src-tauri/icons/icon.png"
      echo "   Place a 1024x1024+ PNG there and re-run."
      exit 1
    fi
    npx @tauri-apps/cli icon src-tauri/icons/icon.png
    echo "✅ Icons generated for all platforms."
    ;;
  all)
    echo "📱 Building all mobile platforms..."
    bash "$0" ios
    bash "$0" android
    ;;
  help|*)
    echo "Increa Reader — Mobile Build Script"
    echo ""
    echo "Usage: $0 {command}"
    echo ""
    echo "  init:ios       Initialize iOS project (first time only, requires macOS + Xcode)"
    echo "  init:android   Initialize Android project (first time only, requires Android SDK)"
    echo "  ios            Build iOS release (requires macOS + Xcode)"
    echo "  android        Build Android release (requires Android SDK)"
    echo "  dev:ios        Start iOS dev server (simulator)"
    echo "  dev:android    Start Android dev server (emulator)"
    echo "  icons          Generate all platform icons from source"
    echo "  all            Build both iOS + Android"
    echo ""
    echo "Environment:"
    echo "  iOS:      Needs Xcode 15+, rustup target add aarch64-apple-ios"
    echo "  Android:  Needs Android NDK 25+, ANDROID_NDK_HOME set"
    exit 0
    ;;
esac