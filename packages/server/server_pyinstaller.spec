# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Increa Reader Server — builds a standalone executable.

Usage:
    pyinstaller server_pyinstaller.spec

The resulting binary is placed in dist/server/ and should be copied to:
    packages/desktop/src-tauri/binaries/server-{target-triple}

The binary accepts CLI arguments:
    ./server --port 3002 --repo /path/to/workspace
"""

import os
import sys
from pathlib import Path

# Resolve project root (packages/server/)
SERVER_DIR = Path(SPECPATH)
PROJECT_ROOT = SERVER_DIR.parent

# Collect all Python source packages
increa_reader_pkg = str(SERVER_DIR / 'increa_reader')

a = Analysis(
    [str(SERVER_DIR / 'sidecar_entry.py')],
    pathex=[str(SERVER_DIR)],
    binaries=[],
    datas=[
        # Include the increa_reader package
        (increa_reader_pkg, 'increa_reader'),
    ],
    hiddenimports=[
        # FastAPI & uvicorn
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'starlette',
        'starlette.responses',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.convertors',
        # PyMuPDF
        'fitz',
        'pymupdf4llm',
        # HTTP client
        'httpx',
        'httpcore',
        'h11',
        'h2',
        # dotenv
        'dotenv',
        # Server modules
        'increa_reader',
        'increa_reader.main',
        'increa_reader.workspace',
        'increa_reader.workspace_routes',
        'increa_reader.file_routes',
        'increa_reader.pdf_routes',
        'increa_reader.pdf_processor',
        'increa_reader.pdf_tools',
        'increa_reader.chat',
        'increa_reader.chat_utils',
        'increa_reader.ai_routes',
        'increa_reader.ai_cache',
        'increa_reader.notes_routes',
        'increa_reader.board_routes',
        'increa_reader.session_routes',
        'increa_reader.search_routes',
        'increa_reader.tags_routes',
        'increa_reader.links_routes',
        'increa_reader.link_index',
        'increa_reader.index_watcher',
        'increa_reader.export_routes',
        'increa_reader.config_routes',
        'increa_reader.version_routes',
        'increa_reader.template_routes',
        'increa_reader.calendar_routes',
        'increa_reader.progress_routes',
        'increa_reader.models',
        'increa_reader.frontend_tools',
        # Additional dependencies
        'aiofiles',
        'python_multipart',
        'mcp',
        'fastmcp',
        'anyio',
        'sniffio',
        'click',
        'pydantic',
        'pydantic_core',
        'email_validator',
        'websockets',
        'jsonschema',
        'markdown_it',
        'mdurl',
        'watchfiles',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Unnecessary large modules
        'tkinter',
        'unittest',
        'test',
        'tests',
        'setuptools',
        'pip',
        'wheel',
        'distutils',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=False,
    console=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=True,
    upx=False,
    name='server',
)