#!/usr/bin/env bash
# =============================================================================
# Increa Reader — Build Python server as standalone binary via PyInstaller
#
# Usage:
#   ./build_sidecar.sh                    # Build for current platform
#   ./build_sidecar.sh --target x86_64-unknown-linux-gnu
#   ./build_sidecar.sh --target aarch64-apple-darwin
#   ./build_sidecar.sh --target x86_64-apple-darwin
#   ./build_sidecar.sh --target x86_64-pc-windows-msvc
#
# Output:
#   dist/server/server  (or server.exe on Windows)
#
# After building, copy the binary to:
#   packages/desktop/src-tauri/binaries/server-{target-triple}
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(cd "$SERVER_DIR/../.." && pwd)"
DESKTOP_BINARIES="$PROJECT_ROOT/packages/desktop/src-tauri/binaries"

# ── Parse arguments ────────────────────────────────────────────────────────
TARGET_TRIPLE=""
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            TARGET_TRIPLE="$2"
            shift 2
            ;;
        --output|-o)
            OUTPUT_DIR="$2"
            export OUTPUT_DIR
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: $0 [--target <triple>] [--output <dir>]"
            exit 1
            ;;
    esac
done

# ── Detect target triple if not specified ──────────────────────────────────
if [[ -z "$TARGET_TRIPLE" ]]; then
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)
            case "$ARCH" in
                x86_64)  TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
                aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
                *)       TARGET_TRIPLE="$ARCH-unknown-linux-gnu" ;;
            esac
            ;;
        Darwin)
            case "$ARCH" in
                arm64)   TARGET_TRIPLE="aarch64-apple-darwin" ;;
                x86_64)  TARGET_TRIPLE="x86_64-apple-darwin" ;;
                *)       TARGET_TRIPLE="$ARCH-apple-darwin" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$ARCH" in
                x86_64)  TARGET_TRIPLE="x86_64-pc-windows-msvc" ;;
                *)       TARGET_TRIPLE="$ARCH-pc-windows-msvc" ;;
            esac
            ;;
        *)
            echo "⚠️  Unsupported OS: $OS"
            echo "   Please specify --target manually."
            exit 1
            ;;
    esac
fi

echo "🔧 Building Increa Reader server sidecar"
echo "   Target triple: $TARGET_TRIPLE"

# ── Check prerequisites ───────────────────────────────────────────────────
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "❌ Python not found. Install Python 3.10+ to continue."
    exit 1
fi

PYTHON_CMD="$(command -v python3 2>/dev/null || command -v python)"

# ── Create venv if needed ─────────────────────────────────────────────────
VENV_DIR="$SERVER_DIR/.venv"
if [[ ! -d "$VENV_DIR" ]]; then
    echo "📦 Creating virtual environment..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

# Activate venv
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate" 2>/dev/null || true
if [[ -f "$VENV_DIR/Scripts/activate" ]]; then
    # Windows Git Bash
    # shellcheck disable=SC1091
    source "$VENV_DIR/Scripts/activate"
fi

# ── Install dependencies ───────────────────────────────────────────────────
echo "📦 Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r "$SERVER_DIR/requirements.txt" --quiet
pip install pyinstaller --quiet

# ── Build with PyInstaller ────────────────────────────────────────────────
echo "🔨 Building server binary with PyInstaller..."
cd "$SERVER_DIR"

# Clean previous builds
rm -rf build/ dist/

pyinstaller server_pyinstaller.spec --noconfirm --clean

# ── Verify output ──────────────────────────────────────────────────────────
BINARY_NAME="server"
BINARY_EXT=""
if [[ "$TARGET_TRIPLE" == *"-windows-"* ]]; then
    BINARY_NAME="server.exe"
    BINARY_EXT=".exe"
fi

OUTPUT_PATH="$SERVER_DIR/dist/server/$BINARY_NAME"

if [[ ! -f "$OUTPUT_PATH" ]]; then
    echo "❌ Build failed — expected binary not found at $OUTPUT_PATH"
    ls -la "$SERVER_DIR/dist/" 2>/dev/null || true
    exit 1
fi

chmod +x "$OUTPUT_PATH"

echo "✅ Server binary built successfully: $OUTPUT_PATH"
du -sh "$SERVER_DIR/dist/server/"

# ── Copy to Tauri binaries directory ───────────────────────────────────────
DEST_DIR="$DESKTOP_BINARIES"
mkdir -p "$DEST_DIR"

# Tauri sidecar naming convention: {name}-{target-triple}[.exe]
# The name must match the "name" field in tauri.conf.json plugins.shell.scope
DEST_FILE="$DEST_DIR/python-server-${TARGET_TRIPLE}${BINARY_EXT}"

echo "📋 Copying binary to $DEST_FILE"
cp "$OUTPUT_PATH" "$DEST_FILE"
chmod +x "$DEST_FILE"

echo ""
echo "✅ Sidecar binary installed: $DEST_FILE"
echo ""
echo "   To build the Tauri desktop app, run:"
echo "     cd $PROJECT_ROOT/packages/desktop && pnpm tauri build"
echo ""
echo "   Or for development:"
echo "     cd $PROJECT_ROOT/packages/desktop && pnpm tauri dev"