#!/usr/bin/env python3
"""
Increa Reader Server — Sidecar Entry Point

This script is the entry point when the server runs as a Tauri sidecar binary.
It accepts command-line arguments for port and repo path (passed from the Rust
sidecar launcher) and translates them into environment variables before
importing and running the actual server.

Usage:
    python sidecar_entry.py --port 3002 --repo /path/to/workspace

In the bundled sidecar binary, this replaces the default server.py entry point
with one that can accept CLI args from the Tauri shell plugin.
"""

import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Increa Reader Server (Tauri Sidecar Entry Point)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to run the server on (overrides PORT env var)",
    )
    parser.add_argument(
        "--repo",
        type=str,
        default=None,
        help="Repository path(s), colon-separated (overrides INCREA_REPO env var)",
    )
    args = parser.parse_args()

    # Translate CLI args to environment variables
    if args.port is not None:
        os.environ["PORT"] = str(args.port)
    if args.repo is not None:
        os.environ["INCREA_REPO"] = args.repo

    # Import and run the actual server
    # When bundled with PyInstaller, the increa_reader package is included
    # in the binary's data directory.
    try:
        from increa_reader.main import app
        import uvicorn

        port = int(os.getenv("PORT", 3002))
        print(f"🚀 Starting Increa Reader server on port {port}")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            log_level="info",
            timeout_graceful_shutdown=5,
        )
    except ImportError as e:
        print(f"❌ Failed to import server module: {e}", file=sys.stderr)
        print("   Make sure the increa_reader package is available.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()