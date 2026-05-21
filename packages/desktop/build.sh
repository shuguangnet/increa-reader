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
SRC_TAURI_DIR="$DESKTOP_DIR/src-tauri"
DESKTOP_RELEASE_DIR="$SRC_TAURI_DIR/target/release"
DESKTOP_DISTRIBUTE_DIR="$DESKTOP_RELEASE_DIR/distribute"
PNPM_CMD="${PNPM_CMD:-}"
PNPM_VERSION=""
TAURI_CMD="${TAURI_CMD:-}"

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

stage_desktop_artifacts() {
    local mode="${1:-release}"
    local bundle_dir
    local destination_dir

    case "$mode" in
        release)
            bundle_dir="$SRC_TAURI_DIR/target/release/bundle"
            destination_dir="$DESKTOP_DISTRIBUTE_DIR"
            ;;
        debug)
            bundle_dir="$SRC_TAURI_DIR/target/debug/bundle"
            destination_dir="$SRC_TAURI_DIR/target/debug/distribute"
            ;;
        *)
            echo "❌ Unsupported artifact staging mode: $mode"
            exit 1
            ;;
    esac

    mkdir -p "$destination_dir"

    BUNDLE_DIR="$bundle_dir" DEST_DIR="$destination_dir" BUILD_MODE="$mode" python3 - <<'PY'
import hashlib
import json
import os
import shutil
from pathlib import Path

bundle_dir = Path(os.environ["BUNDLE_DIR"])
destination_dir = Path(os.environ["DEST_DIR"])
build_mode = os.environ["BUILD_MODE"]
allowed_suffixes = {
    ".app",
    ".appimage",
    ".deb",
    ".dmg",
    ".exe",
    ".msi",
    ".nsis.zip",
    ".rpm",
    ".sig",
    ".tar.gz",
    ".zip",
}

if not bundle_dir.exists():
    print(f"missing_bundle_dir={bundle_dir}")
    print("count=0")
    raise SystemExit(0)

for existing in destination_dir.iterdir():
    if existing.is_dir():
        shutil.rmtree(existing)
    else:
        existing.unlink()

def is_allowed(path: Path) -> bool:
    if path.is_dir() and path.suffix == ".app":
        return True
    name = path.name.lower()
    return any(name.endswith(suffix) for suffix in allowed_suffixes)

def sha256_for(path: Path) -> str:
    digest = hashlib.sha256()
    if path.is_dir():
        for child in sorted(p for p in path.rglob("*") if p.is_file()):
            digest.update(str(child.relative_to(path)).encode("utf-8"))
            with child.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    digest.update(chunk)
    else:
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()

artifacts = []
seen_sources = set()
for path in sorted(bundle_dir.rglob("*")):
    if not is_allowed(path):
        continue
    resolved = path.resolve()
    if resolved in seen_sources:
        continue
    seen_sources.add(resolved)

    target = destination_dir / path.name
    if path.is_dir():
        shutil.copytree(path, target)
    else:
        shutil.copy2(path, target)

    size = sum(child.stat().st_size for child in target.rglob("*") if child.is_file()) if target.is_dir() else target.stat().st_size
    artifacts.append(
        {
            "name": target.name,
            "sha256": sha256_for(target),
            "size": size,
            "source": str(path.relative_to(bundle_dir.parent.parent)),
            "type": "directory" if target.is_dir() else "file",
        }
    )

checksum_lines = [f"{item['sha256']}  {item['name']}" for item in artifacts]
(destination_dir / "SHA256SUMS.txt").write_text("\n".join(checksum_lines) + ("\n" if checksum_lines else ""), encoding="utf-8")
(destination_dir / "manifest.json").write_text(
    json.dumps(
        {
            "buildMode": build_mode,
            "bundleDir": str(bundle_dir),
            "artifactCount": len(artifacts),
            "artifacts": artifacts,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(f"bundle_dir={bundle_dir}")
print(f"destination={destination_dir}")
print(f"count={len(artifacts)}")
for item in artifacts:
    print(item["name"])
PY
}

verify_staged_desktop_artifacts() {
    local mode="${1:-release}"
    local destination_dir

    case "$mode" in
        release)
            destination_dir="$DESKTOP_DISTRIBUTE_DIR"
            ;;
        debug)
            destination_dir="$SRC_TAURI_DIR/target/debug/distribute"
            ;;
        *)
            echo "❌ Unsupported artifact verification mode: $mode"
            exit 1
            ;;
    esac

    DEST_DIR="$destination_dir" BUILD_MODE="$mode" python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path

destination_dir = Path(os.environ["DEST_DIR"])
build_mode = os.environ["BUILD_MODE"]
manifest_path = destination_dir / "manifest.json"
checksums_path = destination_dir / "SHA256SUMS.txt"

if not manifest_path.exists():
    raise SystemExit(f"missing manifest: {manifest_path}")
if not checksums_path.exists():
    raise SystemExit(f"missing checksum file: {checksums_path}")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
artifacts = manifest.get("artifacts", [])
artifact_count = manifest.get("artifactCount")

if manifest.get("buildMode") != build_mode:
    raise SystemExit(
        f"manifest buildMode mismatch: expected {build_mode}, got {manifest.get('buildMode')}"
    )
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

allowed_suffixes = (
    ".app",
    ".appimage",
    ".deb",
    ".dmg",
    ".exe",
    ".msi",
    ".nsis.zip",
    ".rpm",
    ".sig",
    ".tar.gz",
    ".zip",
)

def sha256_for(path: Path) -> str:
    digest = hashlib.sha256()
    if path.is_dir():
        for child in sorted(p for p in path.rglob("*") if p.is_file()):
            digest.update(str(child.relative_to(path)).encode("utf-8"))
            with child.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    digest.update(chunk)
    else:
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()

for item in artifacts:
    name = item.get("name")
    sha256 = item.get("sha256")
    size = item.get("size")
    artifact_type = item.get("type")
    artifact_path = destination_dir / str(name)
    if not name or not any(str(name).lower().endswith(suffix) for suffix in allowed_suffixes):
        raise SystemExit(f"unexpected artifact name: {name}")
    if artifact_type not in {"file", "directory"}:
        raise SystemExit(f"unexpected artifact type for {name}: {artifact_type}")
    if not artifact_path.exists():
        raise SystemExit(f"staged artifact missing on disk: {artifact_path}")
    if artifact_type == "directory" and not artifact_path.is_dir():
        raise SystemExit(f"artifact type mismatch for {name}: expected directory")
    if artifact_type == "file" and not artifact_path.is_file():
        raise SystemExit(f"artifact type mismatch for {name}: expected file")
    actual_size = (
        sum(child.stat().st_size for child in artifact_path.rglob("*") if child.is_file())
        if artifact_path.is_dir()
        else artifact_path.stat().st_size
    )
    if size != actual_size:
        raise SystemExit(f"artifact size mismatch for {name}: {size} != {actual_size}")
    if sha256 != sha256_for(artifact_path):
        raise SystemExit(f"artifact sha256 mismatch for {name}")
    checksum_line = f"{sha256}  {name}"
    if checksum_line not in checksum_lines:
        raise SystemExit(f"checksum entry missing for {name}")

print(f"validated_build_mode={build_mode}")
print(f"validated_destination={destination_dir}")
print(f"validated_count={len(artifacts)}")
for item in artifacts:
    print(item["name"])
PY
}

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

    echo "❌ pnpm not found. Install pnpm or prepare corepack pnpm${PNPM_VERSION:+@$PNPM_VERSION} first."
    exit 1
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

    echo "❌ Tauri CLI not found. Run dependency installation first."
    exit 1
}

tauri_run() {
    resolve_tauri
    bash -lc "$TAURI_CMD $*"
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
        tauri_run "dev"
        ;;
    build)
        echo "🔨 Building desktop app..."
        require_cargo
        build_sidecar
        cd "$DESKTOP_DIR"
        tauri_run "build"
        stage_output="$(stage_desktop_artifacts release)"
        verify_output="$(verify_staged_desktop_artifacts release)"
        echo ""
        echo "$stage_output"
        echo "$verify_output"
        echo "✅ Build complete! Check src-tauri/target/release/bundle/ for installers."
        echo "📦 Staged distribution files in src-tauri/target/release/distribute/"
        ;;
    build:debug)
        echo "🔨 Building desktop app (debug)..."
        require_cargo
        build_sidecar
        cd "$DESKTOP_DIR"
        tauri_run "build --debug"
        stage_output="$(stage_desktop_artifacts debug)"
        verify_output="$(verify_staged_desktop_artifacts debug)"
        echo ""
        echo "$stage_output"
        echo "$verify_output"
        echo "✅ Debug build complete! Check src-tauri/target/debug/bundle/"
        echo "📦 Staged distribution files in src-tauri/target/debug/distribute/"
        ;;
    stage:artifacts)
        echo "📦 Staging desktop build artifacts into a stable distribution directory..."
        cd "$DESKTOP_DIR"
        stage_output="$(stage_desktop_artifacts release)"
        verify_output="$(verify_staged_desktop_artifacts release)"
        echo "$stage_output"
        echo "$verify_output"
        ;;
    stage:artifacts:debug)
        echo "📦 Staging debug desktop build artifacts into a stable distribution directory..."
        cd "$DESKTOP_DIR"
        stage_output="$(stage_desktop_artifacts debug)"
        verify_output="$(verify_staged_desktop_artifacts debug)"
        echo "$stage_output"
        echo "$verify_output"
        ;;
    clean)
        echo "🧹 Cleaning build artifacts..."
        cd "$DESKTOP_DIR"
        cargo clean 2>/dev/null || true
        rm -rf src-tauri/target src-tauri/gen
        echo "✅ Clean complete."
        ;;
    *)
        echo "Usage: $0 {dev|build|build:debug|stage:artifacts|stage:artifacts:debug|clean}"
        exit 1
        ;;
esac
