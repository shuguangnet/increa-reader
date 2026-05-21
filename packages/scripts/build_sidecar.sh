#!/usr/bin/env bash
# =============================================================================
# Increa Reader — Unified Sidecar Build Script
#
# Builds the Python server as a standalone binary using PyInstaller and
# copies it to the Tauri binaries directory with the correct naming convention.
#
# This script:
#   1. Sets up a Python virtual environment (if needed)
#   2. Installs dependencies including PyInstaller
#   3. Builds the server binary
#   4. Copies the binary to packages/desktop/src-tauri/binaries/
#
# Usage:
#   ./build_sidecar.sh                              # Build for current platform
#   ./build_sidecar.sh --target x86_64-unknown-linux-gnu
#   ./build_sidecar.sh --target aarch64-apple-darwin
#   ./build_sidecar.sh --all                        # Build all supported platforms (cross-compile)
#   ./build_sidecar.sh --clean                      # Clean build artifacts
#   ./build_sidecar.sh --help                       # Show help
#
# Supported target triples:
#   - x86_64-unknown-linux-gnu          (Linux x86_64)
#   - aarch64-unknown-linux-gnu         (Linux ARM64)
#   - x86_64-apple-darwin               (macOS Intel)
#   - aarch64-apple-darwin              (macOS Apple Silicon)
#   - x86_64-pc-windows-msvc            (Windows x86_64)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PACKAGES_DIR/.." && pwd)"
SERVER_DIR="$PACKAGES_DIR/server"
DESKTOP_DIR="$PACKAGES_DIR/desktop"
BINARIES_DIR="$DESKTOP_DIR/src-tauri/binaries"

PYTHON_BIN=""
UV_BIN="$(command -v uv 2>/dev/null || true)"

# ── Colorized output helpers ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}ℹ️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
error() { echo -e "${RED}❌ $*${NC}" >&2; }

find_python() {
    if command -v python3 >/dev/null 2>&1; then
        command -v python3
    elif command -v python >/dev/null 2>&1; then
        command -v python
    else
        return 1
    fi
}

setup_python_env() {
    local VENV_DIR="$SERVER_DIR/.venv"

    if [[ -x "$VENV_DIR/bin/python" ]]; then
        PYTHON_BIN="$VENV_DIR/bin/python"
        return 0
    fi

    if [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
        PYTHON_BIN="$VENV_DIR/Scripts/python.exe"
        return 0
    fi

    if [[ -n "$UV_BIN" ]]; then
        info "Creating Python virtual environment with uv..."
        "$UV_BIN" venv "$VENV_DIR"
    else
        local SYSTEM_PYTHON
        SYSTEM_PYTHON="$(find_python)" || {
            error "Python 3 is required to build the sidecar"
            return 1
        }

        info "Creating Python virtual environment with $SYSTEM_PYTHON..."
        "$SYSTEM_PYTHON" -m venv "$VENV_DIR"
    fi

    if [[ -x "$VENV_DIR/bin/python" ]]; then
        PYTHON_BIN="$VENV_DIR/bin/python"
    elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
        PYTHON_BIN="$VENV_DIR/Scripts/python.exe"
    else
        error "Could not locate Python interpreter in virtual environment: $VENV_DIR"
        return 1
    fi
}

install_python_dependencies() {
    if [[ -n "$UV_BIN" ]]; then
        info "Installing Python dependencies with uv..."
        "$UV_BIN" pip install --python "$PYTHON_BIN" -r "$SERVER_DIR/requirements.txt" pyinstaller
    else
        info "Installing Python dependencies with pip..."
        "$PYTHON_BIN" -m pip install --upgrade pip
        "$PYTHON_BIN" -m pip install -r "$SERVER_DIR/requirements.txt" pyinstaller
    fi
}

# ── Supported targets ──────────────────────────────────────────────────────
SUPPORTED_TARGETS=(
    "x86_64-unknown-linux-gnu"
    "aarch64-unknown-linux-gnu"
    "x86_64-apple-darwin"
    "aarch64-apple-darwin"
    "x86_64-pc-windows-msvc"
)

# ── Detect current platform's target triple ───────────────────────────────
detect_target() {
    local OS="$(uname -s)"
    local ARCH="$(uname -m)"

    case "$OS" in
        Linux)
            case "$ARCH" in
                x86_64)  echo "x86_64-unknown-linux-gnu" ;;
                aarch64) echo "aarch64-unknown-linux-gnu" ;;
                *)       echo "$ARCH-unknown-linux-gnu" ;;
            esac
            ;;
        Darwin)
            case "$ARCH" in
                arm64)   echo "aarch64-apple-darwin" ;;
                x86_64)  echo "x86_64-apple-darwin" ;;
                *)       echo "$ARCH-apple-darwin" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$ARCH" in
                x86_64)  echo "x86_64-pc-windows-msvc" ;;
                *)       echo "$ARCH-pc-windows-msvc" ;;
            esac
            ;;
        *)
            echo ""
            ;;
    esac
}

# ── Build for a specific target ────────────────────────────────────────────
build_target() {
    local TARGET="$1"
    local BINARY_EXT=""

    if [[ "$TARGET" == *"-windows-"* ]]; then
        BINARY_EXT=".exe"
    fi

    info "Building sidecar for target: $TARGET"

    # ── Ensure binaries directory exists ──────────────────────────────────
    mkdir -p "$BINARIES_DIR"

    # ── Set up Python environment & dependencies ───────────────────────────
    setup_python_env
    install_python_dependencies

    # ── Build with PyInstaller ─────────────────────────────────────────────
    info "Running PyInstaller..."
    cd "$SERVER_DIR"

    # Clean previous builds
    rm -rf build/ dist/

    "$PYTHON_BIN" -m PyInstaller server_pyinstaller.spec --noconfirm --clean

    # ── Verify output ──────────────────────────────────────────────────────
    local BINARY_NAME="server${BINARY_EXT}"
    local OUTPUT_PATH="$SERVER_DIR/dist/server/$BINARY_NAME"

    if [[ ! -f "$OUTPUT_PATH" ]]; then
        error "Build failed — expected binary not found at $OUTPUT_PATH"
        ls -la "$SERVER_DIR/dist/" 2>/dev/null || true
        return 1
    fi

    chmod +x "$OUTPUT_PATH"

    # ── Copy to Tauri binaries directory ───────────────────────────────────
    # The name must match the "name" field in tauri.conf.json plugins.shell.scope
    local DEST_FILE="$BINARIES_DIR/python-server-${TARGET}${BINARY_EXT}"

    info "Copying binary to $DEST_FILE"
    cp "$OUTPUT_PATH" "$DEST_FILE"
    chmod +x "$DEST_FILE"

    ok "Sidecar binary built and installed: $DEST_FILE"
    du -sh "$DEST_FILE"

    # ── Clean up PyInstaller artifacts ─────────────────────────────────────
    rm -rf "$SERVER_DIR/build"

    cd "$PROJECT_ROOT"
}

# ── Parse arguments ────────────────────────────────────────────────────────
TARGET_TRIPLE=""
CLEAN=false
BUILD_ALL=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target|-t)
            TARGET_TRIPLE="$2"
            shift 2
            ;;
        --all|-a)
            BUILD_ALL=true
            shift
            ;;
        --clean|-c)
            CLEAN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Build the Increa Reader Python server as a Tauri sidecar binary."
            echo ""
            echo "Options:"
            echo "  --target, -t <triple>  Target triple (default: auto-detect)"
            echo "  --all, -a              Build for all supported targets"
            echo "  --clean, -c            Clean build artifacts before building"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Supported targets:"
            for t in "${SUPPORTED_TARGETS[@]}"; do
                echo "  $t"
            done
            echo ""
            echo "Output binaries are placed in:"
            echo "  $BINARIES_DIR"
            exit 0
            ;;
        *)
            error "Unknown argument: $1"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# ── Clean mode ─────────────────────────────────────────────────────────────
if [[ "$CLEAN" == true ]]; then
    info "Cleaning build artifacts..."
    rm -rf "$SERVER_DIR/build" "$SERVER_DIR/dist"
    rm -f "$BINARIES_DIR"/python-server-*
    ok "Clean complete."
    exit 0
fi

# ── Auto-detect target if not specified ────────────────────────────────────
if [[ -z "$TARGET_TRIPLE" && "$BUILD_ALL" == false ]]; then
    TARGET_TRIPLE="$(detect_target)"
    if [[ -z "$TARGET_TRIPLE" ]]; then
        error "Could not auto-detect target triple. Please specify --target manually."
        exit 1
    fi
    info "Auto-detected target: $TARGET_TRIPLE"
fi

# ── Build ───────────────────────────────────────────────────────────────────
echo ""
echo "🔧 Increa Reader — Sidecar Build"
echo "   Project root: $PROJECT_ROOT"
echo ""

if [[ "$BUILD_ALL" == true ]]; then
    warn "Cross-compilation for all targets requires proper toolchains."
    warn "Building for the current platform only is recommended."
    echo ""

    for t in "${SUPPORTED_TARGETS[@]}"; do
        echo "──────────────────────────────────────────────"
        build_target "$t" || warn "Failed to build for $t (may need cross-compilation setup)"
        echo ""
    done
else
    build_target "$TARGET_TRIPLE"
fi

echo ""
ok "Build complete!"
echo ""
echo "   Next steps:"
echo "   1. Verify the binary: ls -la $BINARIES_DIR/"
echo "   2. Build the Tauri app:  cd $DESKTOP_DIR && pnpm tauri build"
echo "   3. For development:       cd $DESKTOP_DIR && pnpm tauri dev"