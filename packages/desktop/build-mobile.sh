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
#   ./build-mobile.sh check          — Check prerequisites (Rust targets, env vars)
#   ./build-mobile.sh all            — Build both iOS + Android
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT_DIR"

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

# ── Prerequisite Checks ───────────────────────────────────────────
check_rust_targets() {
  local target="$1"
  if ! rustup target list --installed | grep -q "$target"; then
    warn "Rust target '$target' not installed.Installing..."
    rustup target add "$target"
    info "Installed Rust target: $target"
  fi
}

check_ios_prereqs() {
  echo "🔍 Checking iOS prerequisites..."
  [[ "$(uname)" == "Darwin" ]] || error "iOS builds require macOS (current: $(uname))"
  command -v xcodebuild &>/dev/null || error "Xcode command line tools not found. Install with: xcode-select --install"
  check_rust_targets "aarch64-apple-ios"
  info "iOS prerequisites OK"
}

check_android_prereqs() {
  echo "🔍 Checking Android prerequisites..."
  [[ -n "${ANDROID_HOME:-}" ]] || warn "ANDROID_HOME not set — Gradle may fail to find SDK"
  [[ -n "${ANDROID_NDK_HOME:-}" ]] || warn "ANDROID_NDK_HOME not set — default NDK will be used"
  check_rust_targets "aarch64-linux-android"
  command -v java &>/dev/null || error "Java not found — install JDK 17+ for Android builds"
  info "Android prerequisites OK"
}

# ── Install frontend dependencies ─────────────────────────────────
echo "📦 Installing frontend dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Install desktop package dependencies ───────────────────────────
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Command dispatcher ────────────────────────────────────────────
case "${1:-help}" in
  check)
    echo "🔍 Checking all prerequisites..."
    if [[ "$(uname)" == "Darwin" ]]; then
      check_ios_prereqs
    else
      warn "Skipping iOS checks (not on macOS)"
    fi
    check_android_prereqs
    info "All prerequisite checks passed"
    ;;
  init:ios)
    check_ios_prereqs
    echo "🔧 Initializing iOS project..."
    cd "$DESKTOP_DIR"
    npx tauri ios init
    info "iOS project initialized. Check src-tauri/gen/apple/ for the Xcode project."
    ;;
  init:android)
    check_android_prereqs
    echo "🔧 Initializing Android project..."
    cd "$DESKTOP_DIR"
    npx tauri android init
    info "Android project initialized. Check src-tauri/gen/android/ for the Gradle project."
    ;;
  ios)
    check_ios_prereqs
    echo "📱 Building iOS release..."
    cd "$DESKTOP_DIR"
    npx tauri ios build --release
    echo ""
    info "iOS build complete! IPA in src-tauri/target/ios/release/"
    ;;
  android)
    check_android_prereqs
    echo "📱 Building Android release..."
    cd "$DESKTOP_DIR"
    npx tauri android build --release
    echo ""
    info "Android build complete! APK/AAB in src-tauri/target/android/release/"
    ;;
  dev:ios)
    check_ios_prereqs
    echo "📱 Starting iOS dev server (simulator)..."
    cd "$DESKTOP_DIR"
    npx tauri ios dev
    ;;
  dev:android)
    check_android_prereqs
    echo "📱 Starting Android dev server (emulator)..."
    cd "$DESKTOP_DIR"
    npx tauri android dev
    ;;
  icons)
    echo "🎨 Generating all platform icons from source..."
    cd "$DESKTOP_DIR"
    if [ ! -f "src-tauri/icons/icon.png" ]; then
      error "No source icon found at src-tauri/icons/icon.png — place a 1024x1024+ PNG there and re-run."
    fi
    npx @tauri-apps/cli icon src-tauri/icons/icon.png
    info "Icons generated for all platforms."
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
    echo "  check          Check all prerequisites (Rust targets, env vars)"
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
    echo "  iOS:        Needs Xcode 15+, rustup target add aarch64-apple-ios"
    echo "  Android:   Needs Android NDK 25+, ANDROID_NDK_HOME set, JDK 17+"
    echo "  ANDROID_HOME  — Android SDK root directory"
    echo "  ANDROID_NDK_HOME — Android NDK root directory"
    exit 0
    ;;
esac