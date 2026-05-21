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
#   ./build-mobile.sh sign:android   — Sign Android APK with debug keystore
#   ./build-mobile.sh all            — Build both iOS + Android
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_TAURI_DIR="$DESKTOP_DIR/src-tauri"
GEN_ANDROID_DIR="$SRC_TAURI_DIR/gen/android"
PNPM_CMD="${PNPM_CMD:-}"
TAURI_CMD="${TAURI_CMD:-}"

cd "$ROOT_DIR"

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

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

  error "pnpm not found. Install pnpm or prepare corepack pnpm@10.17.1 first."
}

pnpm_run() {
  resolve_pnpm
  bash -lc "$PNPM_CMD $*"
}

resolve_tauri() {
  if [[ -n "$TAURI_CMD" ]]; then
    return 0
  fi

  if [[ -x "$DESKTOP_DIR/node_modules/.bin/tauri" ]]; then
    TAURI_CMD="$DESKTOP_DIR/node_modules/.bin/tauri"
    return 0
  fi

  if command -v tauri >/dev/null 2>&1; then
    TAURI_CMD="tauri"
    return 0
  fi

  if command -v npx >/dev/null 2>&1; then
    TAURI_CMD="npx tauri"
    return 0
  fi

  error "Tauri CLI not found. Run dependency installation first."
}

tauri_run() {
  resolve_tauri
  bash -lc "$TAURI_CMD $*"
}

prepare_android_keystore() {
  local keystore_b64="${INCREA_ANDROID_KEYSTORE_B64:-${ANDROID_KEYSTORE_B64:-}}"
  local store_password="${INCREA_ANDROID_KEYSTORE_PASSWORD:-${ANDROID_KEYSTORE_PASSWORD:-}}"
  local key_alias="${INCREA_ANDROID_KEY_ALIAS:-${ANDROID_KEY_ALIAS:-}}"
  local key_password="${INCREA_ANDROID_KEY_PASSWORD:-${ANDROID_KEY_PASSWORD:-}}"

  if [[ -z "$keystore_b64" ]]; then
    if [[ -f "$SRC_TAURI_DIR/keystore.properties" ]]; then
      info "Using existing Android keystore.properties"
    else
      warn "No Android release signing env detected; release build may require manual signing for distribution"
    fi
    return 0
  fi

  [[ -n "$store_password" ]] || error "ANDROID_KEYSTORE_PASSWORD is required when ANDROID_KEYSTORE_B64 is set"
  [[ -n "$key_alias" ]] || error "ANDROID_KEY_ALIAS is required when ANDROID_KEYSTORE_B64 is set"
  [[ -n "$key_password" ]] || error "ANDROID_KEY_PASSWORD is required when ANDROID_KEYSTORE_B64 is set"

  local keystore_path="$SRC_TAURI_DIR/release.keystore"
  printf '%s' "$keystore_b64" | base64 --decode > "$keystore_path"

  cat > "$SRC_TAURI_DIR/keystore.properties" <<EOF
storeFile=$keystore_path
storePassword=$store_password
keyAlias=$key_alias
keyPassword=$key_password
EOF

  info "Prepared Android release keystore metadata"
}

sync_android_support_files() {
  if [[ ! -d "$GEN_ANDROID_DIR" ]]; then
    warn "Android project not initialized yet; skipping gen/android support-file sync"
    return 0
  fi

  cp "$SRC_TAURI_DIR/gradle.properties" "$GEN_ANDROID_DIR/gradle.properties"

  if [[ -f "$SRC_TAURI_DIR/keystore.properties" ]]; then
    cp "$SRC_TAURI_DIR/keystore.properties" "$GEN_ANDROID_DIR/keystore.properties"
  fi

  info "Synced Android support files into src-tauri/gen/android"
}

prepare_android_project() {
  prepare_android_keystore
  sync_android_support_files
}

# ── Prerequisite Checks ───────────────────────────────────────────
check_rust_targets() {
  local target="$1"
  if ! rustup target list --installed | grep -q "$target"; then
    warn "Rust target '$target' not installed. Installing..."
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
pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"

# ── Install desktop package dependencies ───────────────────────────
echo "📦 Installing desktop dependencies..."
cd "$DESKTOP_DIR"
pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"

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
    tauri_run "ios init"
    info "iOS project initialized. Check src-tauri/gen/apple/ for the Xcode project."
    ;;
  init:android)
    check_android_prereqs
    echo "🔧 Initializing Android project..."
    cd "$DESKTOP_DIR"
    tauri_run "android init"
    prepare_android_project
    info "Android project initialized. Check src-tauri/gen/android/ for the Gradle project."
    ;;
  prepare:android)
    echo "🛠️  Preparing Android support files..."
    cd "$DESKTOP_DIR"
    prepare_android_project
    ;;
  ios)
    check_ios_prereqs
    echo "📱 Building iOS release..."
    cd "$DESKTOP_DIR"
    tauri_run "ios build --release"
    echo ""
    info "iOS build complete! IPA in src-tauri/target/ios/release/"
    ;;
  android)
    check_android_prereqs
    echo "📱 Building Android release..."
    cd "$DESKTOP_DIR"
    prepare_android_project
    tauri_run "android build --release"
    echo ""
    info "Android build complete! APK/AAB in src-tauri/target/android/release/"
    ;;
  dev:ios)
    check_ios_prereqs
    echo "📱 Starting iOS dev server (simulator)..."
    cd "$DESKTOP_DIR"
    tauri_run "ios dev"
    ;;
  dev:android)
    check_android_prereqs
    echo "📱 Starting Android dev server (emulator)..."
    cd "$DESKTOP_DIR"
    prepare_android_project
    tauri_run "android dev"
    ;;
  sign:android)
    # Sign an unsigned APK with a debug keystore for testing
    check_android_prereqs
    APK_DIR="$DESKTOP_DIR/src-tauri/target/android/release"
    UNSIGNED_APK=$(find "$APK_DIR" -name "*.apk" ! -name "*-signed*" ! -name "*-unaligned*" | head -1)
    if [[ -z "$UNSIGNED_APK" ]]; then
      error "No unsigned APK found in $APK_DIR. Run './build-mobile.sh android' first."
    fi
    KEYSTORE="$DESKTOP_DIR/debug.keystore"
    if [[ ! -f "$KEYSTORE" ]]; then
      warn "Debug keystore not found. Creating one..."
      keytool -genkey -v -keystore "$KEYSTORE" -alias increa_debug -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Increa Debug,O=Increa,C=CN"
      info "Debug keystore created at $KEYSTORE"
    fi
    SIGNED_APK="${UNSIGNED_APK%.apk}-signed.apk"
    apksigner sign --ks "$KEYSTORE" --ks-key-alias increa_debug --ks-pass pass:android --key-pass pass:android --out "$SIGNED_APK" "$UNSIGNED_APK" 2>/dev/null || \
      jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KEYSTORE" -storepass android -keypass android -signedjar "$SIGNED_APK" "$UNSIGNED_APK" increa_debug
    info "Signed APK: $SIGNED_APK"
    ;;
  icons)
    echo "🎨 Generating all platform icons from source..."
    cd "$DESKTOP_DIR"
    if [ ! -f "src-tauri/icons/icon.png" ]; then
      error "No source icon found at src-tauri/icons/icon.png — place a 1024x1024+ PNG there and re-run."
    fi
    tauri_run "icon src-tauri/icons/icon.png"
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
    echo "  prepare:android Sync gradle/signing files into src-tauri/gen/android"
    echo "  ios            Build iOS release (requires macOS + Xcode)"
    echo "  android        Build Android release (requires Android SDK)"
    echo "  dev:ios        Start iOS dev server (simulator)"
    echo "  dev:android    Start Android dev server (emulator)"
    echo "  sign:android   Sign Android APK with debug keystore"
    echo "  icons          Generate all platform icons from source"
    echo "  all            Build both iOS + Android"
    echo ""
    echo "Environment:"
    echo "  iOS:        Needs Xcode 15+, rustup target add aarch64-apple-ios"
    echo "  Android:   Needs Android NDK 25+, ANDROID_NDK_HOME set, JDK 17+"
    echo "  ANDROID_HOME  — Android SDK root directory"
    echo "  ANDROID_NDK_HOME — Android NDK root directory"
    echo "  ANDROID_KEYSTORE_B64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD"
    echo "               Optional Android release signing credentials (CI-friendly)"
    exit 0
    ;;
esac