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
#     - Rust targets: rustup target add aarch64-linux-android x86_64-linux-android
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
TAURI_CONFIG_PATH="$SRC_TAURI_DIR/tauri.conf.json"
EXPORT_OPTIONS_PATH="$SRC_TAURI_DIR/ExportOptions.plist"
IOS_RELEASE_DIR="$SRC_TAURI_DIR/target/ios/release"
ANDROID_RELEASE_DIR="$SRC_TAURI_DIR/target/android/release"
PNPM_CMD="${PNPM_CMD:-}"
TAURI_CMD="${TAURI_CMD:-}"
PNPM_VERSION=""
IOS_TEAM_ID_VALUE=""
IOS_CONFIG_BACKUP_DIR=""

cd "$ROOT_DIR"

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

stage_mobile_artifacts() {
  local platform="$1"
  shift
  local destination_dir="$1"
  shift

  mkdir -p "$destination_dir"

  if [[ $# -eq 0 ]]; then
    error "stage_mobile_artifacts requires at least one search pattern"
  fi

  PLATFORM="$platform" DEST_DIR="$destination_dir" python3 - "$@" <<'PY'
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

platform = os.environ["PLATFORM"]
destination = Path(os.environ["DEST_DIR"])
patterns = sys.argv[1:]
allowed_suffixes = {
    ".ipa",
    ".apk",
    ".aab",
    ".sig",
    ".zip",
}

matches_by_name = {}
for pattern in patterns:
    for path in Path('.').glob(pattern):
        if not path.is_file():
            continue
        if not any(path.name.lower().endswith(suffix) for suffix in allowed_suffixes):
            continue
        resolved = path.resolve()
        current = matches_by_name.get(path.name)
        if current is None:
            matches_by_name[path.name] = resolved
            continue
        current_stat = current.stat()
        resolved_stat = resolved.stat()
        if (resolved_stat.st_mtime_ns, str(resolved)) >= (current_stat.st_mtime_ns, str(current)):
            matches_by_name[path.name] = resolved

matches = sorted(matches_by_name.values(), key=lambda p: (p.stat().st_mtime, str(p)))

with tempfile.TemporaryDirectory(prefix=f"increa-stage-{platform}-") as temp_dir:
    temp_destination = Path(temp_dir)
    staged = []

    for path in matches:
        target = temp_destination / path.name
        shutil.copy2(path, target)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        staged.append(
            {
                "name": target.name,
                "path": str(destination / path.name),
                "source": str(path),
                "sha256": digest,
                "size": target.stat().st_size,
            }
        )

    (temp_destination / "SHA256SUMS.txt").write_text(
        "".join(f"{item['sha256']}  {item['name']}\n" for item in staged),
        encoding="utf-8",
    )
    (temp_destination / "manifest.json").write_text(
        json.dumps(
            {
                "platform": platform,
                "destination": str(destination),
                "artifactCount": len(staged),
                "artifacts": staged,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    for existing in destination.iterdir():
        if existing.is_dir():
            shutil.rmtree(existing)
        else:
            existing.unlink()

    for prepared in temp_destination.iterdir():
        shutil.copy2(prepared, destination / prepared.name)

print(f"platform={platform}")
print(f"destination={destination}")
print(f"count={len(staged)}")
for item in staged:
    print(item["name"])
PY
}

verify_staged_manifest() {
  local platform="$1"
  local destination_dir="$2"

  PLATFORM="$platform" DEST_DIR="$destination_dir" python3 - <<'PY'
import json
import os
from pathlib import Path

platform = os.environ["PLATFORM"]
destination = Path(os.environ["DEST_DIR"])
manifest_path = destination / "manifest.json"
checksums_path = destination / "SHA256SUMS.txt"

if not manifest_path.exists():
    raise SystemExit(f"missing manifest: {manifest_path}")
if not checksums_path.exists():
    raise SystemExit(f"missing checksum file: {checksums_path}")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
artifacts = manifest.get("artifacts", [])
artifact_count = manifest.get("artifactCount")
if manifest.get("platform") != platform:
    raise SystemExit(f"manifest platform mismatch: expected {platform}, got {manifest.get('platform')}")
if not isinstance(artifacts, list):
    raise SystemExit("manifest artifacts must be a list")
if artifact_count != len(artifacts):
    raise SystemExit(f"artifactCount mismatch: {artifact_count} != {len(artifacts)}")
if artifact_count <= 0:
    raise SystemExit("no staged artifacts found")

checksum_lines = {
    line.strip() for line in checksums_path.read_text(encoding="utf-8").splitlines() if line.strip()
}
if len(checksum_lines) != len(artifacts):
    raise SystemExit(
        f"checksum line count mismatch: expected {len(artifacts)}, got {len(checksum_lines)}"
    )

allowed_suffixes = {
    "ios": (".ipa", ".sig", ".zip"),
    "android": (".apk", ".aab", ".sig", ".zip"),
}
expected_suffixes = allowed_suffixes[platform]

for item in artifacts:
    name = item.get("name")
    sha256 = item.get("sha256")
    size = item.get("size")
    artifact_path = destination / name
    if not name or not any(name.lower().endswith(suffix) for suffix in expected_suffixes):
        raise SystemExit(f"unexpected artifact name for {platform}: {name}")
    if not artifact_path.is_file():
        raise SystemExit(f"staged artifact missing on disk: {artifact_path}")
    if size != artifact_path.stat().st_size:
        raise SystemExit(f"artifact size mismatch for {name}: {size} != {artifact_path.stat().st_size}")
    checksum_line = f"{sha256}  {name}"
    if checksum_line not in checksum_lines:
        raise SystemExit(f"checksum entry missing for {name}")

print(f"validated_platform={platform}")
print(f"validated_destination={destination}")
print(f"validated_count={len(artifacts)}")
for item in artifacts:
    print(item["name"])
PY
}

collect_ios_artifacts() {
  local staged_output
  staged_output="$({
    stage_mobile_artifacts "ios" "$IOS_RELEASE_DIR" \
      "packages/desktop/src-tauri/gen/apple/build/outputs/ipa/**/*.ipa" \
      "packages/desktop/src-tauri/gen/apple/build/outputs/ipa/*.ipa" \
      "packages/desktop/src-tauri/target/ios/**/*.ipa" \
      "packages/desktop/src-tauri/target/ios/*.ipa"
  })"

  local count
  count="$(printf '%s\n' "$staged_output" | awk -F= '/^count=/{print $2; exit}')"

  if [[ "${count:-0}" == "0" ]]; then
    warn "No iOS IPA artifacts found to stage into $IOS_RELEASE_DIR"
    return 1
  fi

  printf '%s\n' "$staged_output"
  info "Staged iOS artifacts into $IOS_RELEASE_DIR"
}

collect_android_artifacts() {
  local staged_output
  staged_output="$({
    stage_mobile_artifacts "android" "$ANDROID_RELEASE_DIR" \
      "packages/desktop/src-tauri/gen/android/app/build/outputs/**/*.apk" \
      "packages/desktop/src-tauri/gen/android/app/build/outputs/**/*.aab" \
      "packages/desktop/src-tauri/target/android/**/*.apk" \
      "packages/desktop/src-tauri/target/android/**/*.aab"
  })"

  local count
  count="$(printf '%s\n' "$staged_output" | awk -F= '/^count=/{print $2; exit}')"

  if [[ "${count:-0}" == "0" ]]; then
    warn "No Android APK/AAB artifacts found to stage into $ANDROID_RELEASE_DIR"
    return 1
  fi

  printf '%s\n' "$staged_output"
  info "Staged Android artifacts into $ANDROID_RELEASE_DIR"
}

cleanup_ios_config() {
  if [[ -n "$IOS_CONFIG_BACKUP_DIR" && -d "$IOS_CONFIG_BACKUP_DIR" ]]; then
    cp "$IOS_CONFIG_BACKUP_DIR/tauri.conf.json" "$TAURI_CONFIG_PATH"
    cp "$IOS_CONFIG_BACKUP_DIR/ExportOptions.plist" "$EXPORT_OPTIONS_PATH"
    rm -rf "$IOS_CONFIG_BACKUP_DIR"
    IOS_CONFIG_BACKUP_DIR=""
    info "Restored iOS signing templates"
  fi
}

trap cleanup_ios_config EXIT

resolve_pnpm() {
  if [[ -n "$PNPM_CMD" ]]; then
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD="$(command -v pnpm)"
    return 0
  fi

  if [[ -z "$PNPM_VERSION" ]]; then
    PNPM_VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

version = ""
for candidate in (Path('package.json'), Path('packages/desktop/package.json')):
    if not candidate.exists():
        continue
    try:
        data = json.loads(candidate.read_text(encoding='utf-8'))
    except Exception:
        continue
    package_manager = data.get('packageManager', '')
    if isinstance(package_manager, str) and package_manager.startswith('pnpm@'):
        version = package_manager.split('@', 1)[1]
        break
print(version)
PY
)"
  fi

  local corepack_pnpm
  corepack_pnpm="$(PNPM_VERSION="$PNPM_VERSION" python3 - <<'PY'
import os
from pathlib import Path

version = os.environ.get('PNPM_VERSION', '').strip()
cache_root = Path.home() / '.cache/node/corepack/pnpm'
candidates = []
if version:
    candidates.append(cache_root / version / 'bin/pnpm.cjs')
if cache_root.exists():
    candidates.extend(sorted(cache_root.glob('*/bin/pnpm.cjs'), reverse=True))

seen = set()
for candidate in candidates:
    candidate = candidate.resolve()
    if candidate in seen:
        continue
    seen.add(candidate)
    if candidate.exists():
        print(candidate)
        break
else:
    print('')
PY
)"

  if [[ -n "$corepack_pnpm" ]]; then
    PNPM_CMD="node $corepack_pnpm"
    return 0
  fi

  error "pnpm not found. Install pnpm or prepare corepack pnpm${PNPM_VERSION:+@$PNPM_VERSION} first."
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

resolve_ios_team_id() {
  local require_team_id="${1:-strict}"

  if [[ -n "$IOS_TEAM_ID_VALUE" ]]; then
    return 0
  fi

  IOS_TEAM_ID_VALUE="${INCREA_IOS_TEAM_ID:-${TAURI_IOS_TEAM_ID:-}}"

  if [[ -z "$IOS_TEAM_ID_VALUE" ]]; then
    if [[ "$require_team_id" == "strict" ]]; then
      if [[ "$(uname)" == "Darwin" ]]; then
        error "Missing iOS Team ID. Set INCREA_IOS_TEAM_ID or TAURI_IOS_TEAM_ID before init/dev/build iOS."
      fi
      warn "No iOS Team ID env found. Non-macOS checks can continue, but iOS init/dev/build requires INCREA_IOS_TEAM_ID or TAURI_IOS_TEAM_ID."
      return 0
    fi

    return 0
  fi

  if [[ ! "$IOS_TEAM_ID_VALUE" =~ ^[A-Z0-9]{10}$ ]]; then
    error "Invalid iOS Team ID '$IOS_TEAM_ID_VALUE'. Expected 10 uppercase letters/digits."
  fi
}

prepare_ios_signing() {
  resolve_ios_team_id
  [[ -n "$IOS_TEAM_ID_VALUE" ]] || return 0

  if [[ -n "$IOS_CONFIG_BACKUP_DIR" ]]; then
    return 0
  fi

  IOS_CONFIG_BACKUP_DIR="$(mktemp -d)"
  cp "$TAURI_CONFIG_PATH" "$IOS_CONFIG_BACKUP_DIR/tauri.conf.json"
  cp "$EXPORT_OPTIONS_PATH" "$IOS_CONFIG_BACKUP_DIR/ExportOptions.plist"

  IOS_TEAM_ID_VALUE="$IOS_TEAM_ID_VALUE" TAURI_CONFIG_PATH="$TAURI_CONFIG_PATH" EXPORT_OPTIONS_PATH="$EXPORT_OPTIONS_PATH" python3 - <<'PY'
import json
import os
import plistlib
from pathlib import Path

team_id = os.environ['IOS_TEAM_ID_VALUE']
ta_path = Path(os.environ['TAURI_CONFIG_PATH'])
export_path = Path(os.environ['EXPORT_OPTIONS_PATH'])

config = json.loads(ta_path.read_text())
config.setdefault('bundle', {}).setdefault('iOS', {})['developmentTeam'] = team_id
ta_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

with export_path.open('rb') as fh:
    export_options = plistlib.load(fh)
export_options['teamID'] = team_id
with export_path.open('wb') as fh:
    plistlib.dump(export_options, fh, sort_keys=False)
PY

  info "Prepared iOS signing config with Team ID $IOS_TEAM_ID_VALUE"
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

ensure_android_project_initialized() {
  if [[ -d "$GEN_ANDROID_DIR" ]]; then
    return 0
  fi

  warn "Android Gradle project missing at src-tauri/gen/android; running 'tauri android init' automatically"
  cd "$DESKTOP_DIR"
  tauri_run "android init"
  info "Android project initialized automatically"
}

prepare_android_build_inputs() {
  ensure_android_project_initialized
  prepare_android_project
}

# ── Prerequisite Checks ───────────────────────────────────────────
check_rust_targets() {
  local target="$1"
  command -v rustup &>/dev/null || error "rustup not found — install Rust toolchain manager from https://rustup.rs"
  if ! rustup target list --installed | grep -q "$target"; then
    warn "Rust target '$target' not installed. Installing..."
    rustup target add "$target"
    info "Installed Rust target: $target"
  fi
}

check_ios_prereqs() {
  local require_team_id="${1:-strict}"

  echo "🔍 Checking iOS prerequisites..."
  [[ "$(uname)" == "Darwin" ]] || error "iOS builds require macOS (current: $(uname))"
  command -v xcodebuild &>/dev/null || error "Xcode command line tools not found. Install with: xcode-select --install"

  if [[ "$require_team_id" == "strict" ]]; then
    resolve_ios_team_id strict
    [[ -n "$IOS_TEAM_ID_VALUE" ]] || error "Missing iOS Team ID. Set INCREA_IOS_TEAM_ID or TAURI_IOS_TEAM_ID before building iOS."
  else
    resolve_ios_team_id optional
    if [[ -z "$IOS_TEAM_ID_VALUE" ]]; then
      warn "iOS Team ID not set; generic environment checks passed, but init/dev/build iOS still requires INCREA_IOS_TEAM_ID or TAURI_IOS_TEAM_ID."
    fi
  fi

  check_rust_targets "aarch64-apple-ios"
  info "iOS prerequisites OK"
}

check_android_prereqs() {
  echo "🔍 Checking Android prerequisites..."
  [[ -n "${ANDROID_HOME:-}" ]] || warn "ANDROID_HOME not set — Gradle may fail to find SDK"
  [[ -n "${ANDROID_NDK_HOME:-}" ]] || warn "ANDROID_NDK_HOME not set — default NDK will be used"
  command -v java &>/dev/null || error "Java not found — install JDK 17+ for Android builds"
  check_rust_targets "aarch64-linux-android"
  check_rust_targets "x86_64-linux-android"
  info "Android prerequisites OK"
}

# ── Helper: install frontend + desktop dependencies ──────────────────
install_desktop_deps() {
    echo "📦 Installing frontend dependencies..."
    pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"

    echo "📦 Installing desktop dependencies..."
    cd "$DESKTOP_DIR"
    pnpm_run "install --frozen-lockfile" 2>/dev/null || pnpm_run "install"
    cd "$ROOT_DIR"
}

# ── Command dispatcher ────────────────────────────────────────────
case "${1:-help}" in
  check)
    echo "🔍 Checking all prerequisites..."
    if [[ "$(uname)" == "Darwin" ]]; then
      check_ios_prereqs optional
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
    prepare_ios_signing
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
  prepare:ios)
    echo "🛠️  Preparing iOS signing files..."
    cd "$DESKTOP_DIR"
    prepare_ios_signing
    ;;
  prepare:android)
    echo "🛠️  Preparing Android support files..."
    cd "$DESKTOP_DIR"
    prepare_android_build_inputs
    ;;
  ios)
    export INCREA_SKIP_SIDECAR_BUILD=1
    install_desktop_deps
    check_ios_prereqs
    echo "📱 Building iOS release..."
    echo "   (Python sidecar skipped — mobile connects to remote server)"
    cd "$DESKTOP_DIR"
    prepare_ios_signing
    tauri_run "ios build --release"
    cd "$ROOT_DIR"
    if collect_ios_artifacts; then
      verify_staged_manifest "ios" "$IOS_RELEASE_DIR"
    else
      error "iOS build completed but no IPA artifacts were found — check Xcode / Tauri output"
    fi
    echo ""
    info "iOS build complete! IPA in src-tauri/target/ios/release/"
    ;;
  android)
    export INCREA_SKIP_SIDECAR_BUILD=1
    install_desktop_deps
    check_android_prereqs
    echo "📱 Building Android release..."
    echo "   (Python sidecar skipped — mobile connects to remote server)"
    cd "$DESKTOP_DIR"
    prepare_android_build_inputs
    tauri_run "android build --release"
    cd "$ROOT_DIR"
    if collect_android_artifacts; then
      verify_staged_manifest "android" "$ANDROID_RELEASE_DIR"
    else
      error "Android build completed but no APK/AAB artifacts were found — check Gradle / Tauri output"
    fi
    echo ""
    info "Android build complete! APK/AAB in src-tauri/target/android/release/"
    ;;
  stage:ios-artifacts)
    echo "📦 Staging iOS artifacts into stable release directory..."
    cd "$ROOT_DIR"
    collect_ios_artifacts
    verify_staged_manifest "ios" "$IOS_RELEASE_DIR"
    ;;
  stage:android-artifacts)
    echo "📦 Staging Android artifacts into stable release directory..."
    cd "$ROOT_DIR"
    collect_android_artifacts
    verify_staged_manifest "android" "$ANDROID_RELEASE_DIR"
    ;;
  dev:ios)
    export INCREA_SKIP_SIDECAR_BUILD=1
    install_desktop_deps
    check_ios_prereqs
    echo "📱 Starting iOS dev server (simulator)..."
    echo "   (Python sidecar skipped — mobile dev connects to remote server)"
    cd "$DESKTOP_DIR"
    prepare_ios_signing
    tauri_run "ios dev"
    ;;
  dev:android)
    export INCREA_SKIP_SIDECAR_BUILD=1
    install_desktop_deps
    check_android_prereqs
    echo "📱 Starting Android dev server (emulator)..."
    echo "   (Python sidecar skipped — mobile dev connects to remote server)"
    cd "$DESKTOP_DIR"
    prepare_android_build_inputs
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
    export INCREA_SKIP_SIDECAR_BUILD=1
    install_desktop_deps
    echo "📱 Building all mobile platforms..."
    echo "   (Python sidecar skipped — mobile connects to remote server)"
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
    echo "  prepare:ios    Inject Team ID into iOS build templates for the current run"
    echo "  prepare:android Auto-init Android project when missing, then sync gradle/signing files"
    echo "  ios            Build iOS release (requires macOS + Xcode)"
    echo "  android        Build Android release (requires Android SDK)"
    echo "  stage:ios-artifacts     Collect generated IPA files into src-tauri/target/ios/release/"
    echo "  stage:android-artifacts Collect generated APK/AAB files into src-tauri/target/android/release/"
    echo "  dev:ios        Start iOS dev server (simulator)"
    echo "  dev:android    Start Android dev server (emulator)"
    echo "  sign:android   Sign Android APK with debug keystore"
    echo "  icons          Generate all platform icons from source"
    echo "  all            Build both iOS + Android"
    echo ""
    echo "Environment:"
    echo "  iOS:        Needs Xcode 15+, rustup target add aarch64-apple-ios"
    echo "  INCREA_IOS_TEAM_ID / TAURI_IOS_TEAM_ID"
    echo "               Required for iOS init/dev/build; injected into tauri.conf.json and ExportOptions.plist at runtime"
    echo "  Android:   Needs Android NDK 25+, ANDROID_NDK_HOME set, JDK 17+"
    echo "  ANDROID_HOME  — Android SDK root directory"
    echo "  ANDROID_NDK_HOME — Android NDK root directory"
    echo "  ANDROID_KEYSTORE_B64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD"
    echo "               Optional Android release signing credentials (CI-friendly)"
    echo "               Android init is auto-triggered before prepare/dev/build when gen/android is missing"
    echo "               Required Rust targets: aarch64-linux-android + x86_64-linux-android"
    exit 0
    ;;
esac
