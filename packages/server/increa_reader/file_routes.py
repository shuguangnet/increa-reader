"""
File viewing and preview API routes
"""

import json
import mimetypes
import shutil
import tempfile
from pathlib import Path

import aiofiles
from fastapi import HTTPException
from fastapi.responses import FileResponse

from .models import (
    CopyFileRequest,
    CreateFileRequest,
    RenameFileRequest,
    SaveFileRequest,
    ViewResponse,
    WorkspaceConfig,
)
from .workspace import is_text_file

# Extension to language mapping for code files
EXT_TO_LANG = {
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".mts": "typescript",
    ".cts": "typescript",
    ".py": "python",
    ".pyi": "python",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".hh": "cpp",
    ".go": "go",
    ".rs": "rust",
    ".php": "php",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".json": "json",
    ".jsonc": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".svg": "xml",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".fish": "bash",
    ".vim": "vim",
    ".vimrc": "vim",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "ini",
    ".txt": "text",
    ".log": "text",
    ".nu": "bash",
    ".sql": "sql",
    ".dockerfile": "dockerfile",
    ".gitignore": "text",
    ".gitattributes": "text",
    ".env": "bash",
    ".envrc": "bash",
    ".rb": "ruby",
    ".rake": "ruby",
    ".lua": "lua",
    ".pl": "perl",
    ".pm": "perl",
    ".r": "r",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".hs": "haskell",
    ".elm": "elm",
    ".dart": "dart",
    ".proto": "protobuf",
    ".graphql": "graphql",
    ".gql": "graphql",
}

# Special filenames (without extension) to language mapping
FILENAME_TO_LANG = {
    "makefile": "makefile",
    "dockerfile": "dockerfile",
    "cmakelists.txt": "cmake",
    "gemfile": "ruby",
    "rakefile": "ruby",
    "vagrantfile": "ruby",
    "podfile": "ruby",
    "brewfile": "ruby",
}


def create_file_routes(app, workspace_config: WorkspaceConfig):
    """Create file viewing and preview API routes"""

    @app.get("/api/raw/{repo}/{path:path}")
    async def get_raw_file(repo: str, path: str):
        """Get raw file content (returns file bytes directly)"""
        # Find repository
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(str(file_path))

        return FileResponse(
            file_path,
            media_type=mime_type or "application/octet-stream",
            filename=file_path.name,
        )

    @app.get("/api/views/{repo}/{path:path}")
    async def get_file_content(repo: str, path: str):
        """Get file content"""
        # Find repository
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        # Read file content
        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read()

        if is_text_file(content):
            return ViewResponse(
                type="text",
                content=content.decode("utf-8", errors="replace"),
                filename=Path(path).name,
            )
        else:
            return ViewResponse(
                type="binary",
                content="[Binary file - preview not available]",
                filename=Path(path).name,
            )

    @app.get("/api/preview")
    async def get_file_preview(repo: str, path: str):
        """Get file preview information"""
        # Import here to avoid circular dependency
        from .pdf_routes import get_pdf_metadata

        # Find repository
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        ext = Path(path).suffix.lower()
        filename = Path(path).name.lower()

        # Image files (including SVG which browsers render natively)
        image_exts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg"]
        if ext in image_exts:
            return {"type": "image", "path": path}

        # PDF files
        if ext == ".pdf":
            return await get_pdf_metadata(file_path, path)

        # Board files
        if ext == ".board":
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            board_data = json.loads(content)
            return {"type": "board", "path": path, "data": board_data}

        # HTML files
        if ext in [".html", ".htm"]:
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            return {"type": "html", "path": path, "body": content}

        # Markdown files
        if ext in [".md", ".markdown"]:
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            return {"type": "markdown", "body": content}

        # Mermaid diagram files
        if ext == ".mmd":
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            return {"type": "mermaid", "body": content}

        # CSV files - return as table type for enhanced rendering
        if ext == ".csv":
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            return {"type": "table", "format": "csv", "body": content}

        # Known code/text files by extension or filename
        lang = FILENAME_TO_LANG.get(filename) or EXT_TO_LANG.get(ext)
        if lang:
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            return {"type": "code", "lang": lang, "body": content}

        # Unknown extension: check MIME type first
        mime, _ = mimetypes.guess_type(str(file_path))

        # If MIME type is known and not text/*, treat as unsupported
        if mime is not None and not mime.startswith("text"):
            return {"type": "unsupported", "path": path}

        # MIME is text/* or unknown, verify with content detection
        async with aiofiles.open(file_path, "rb") as f:
            content_bytes = await f.read()

        if is_text_file(content_bytes):
            content = content_bytes.decode("utf-8", errors="replace")
            return {"type": "code", "lang": "text", "body": content}

        return {"type": "unsupported", "path": path}

    @app.post("/api/files/{repo}/{path:path}")
    async def create_file(repo: str, path: str, body: CreateFileRequest):
        """Create a new file or directory"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        # Security check: prevent path traversal
        try:
            file_path = file_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if file_path.exists():
            raise HTTPException(status_code=409, detail="File already exists")

        try:
            if body.type == "dir":
                file_path.mkdir(parents=True, exist_ok=False)
            else:
                file_path.parent.mkdir(parents=True, exist_ok=True)
                if body.content:
                    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                        await f.write(body.content)
                else:
                    file_path.touch()

            return {"success": True, "path": path, "type": body.type}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.put("/api/files/{repo}/{path:path}")
    async def save_file(repo: str, path: str, body: SaveFileRequest):
        """Save/update file content (atomic write)"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        # Security check: prevent path traversal
        try:
            file_path = file_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        try:
            # Atomic write: write to temp file then rename
            tmp_fd, tmp_path = tempfile.mkstemp(
                dir=file_path.parent, prefix=".increa_"
            )
            tmp_file = Path(tmp_path)
            try:
                async with aiofiles.open(tmp_fd, "w", encoding="utf-8") as f:
                    await f.write(body.content)
                tmp_file.replace(file_path)
            except BaseException:
                tmp_file.unlink(missing_ok=True)
                raise

            return {"success": True, "path": path}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.patch("/api/files/{repo}/{path:path}")
    async def rename_file(repo: str, path: str, body: RenameFileRequest):
        """Rename or move a file/directory"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path
        new_file_path = Path(repo_config.root) / body.new_path

        # Security check: prevent path traversal for both paths
        try:
            file_path = file_path.resolve()
            new_file_path = new_file_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
            if not str(new_file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied: new path outside repo")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if new_file_path.exists():
            raise HTTPException(status_code=409, detail="Target already exists")

        try:
            new_file_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(file_path), str(new_file_path))
            return {"success": True, "old_path": path, "new_path": body.new_path}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/files/{repo}/copy")
    async def copy_file(repo: str, body: CopyFileRequest):
        """Copy a file"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        source_path = Path(repo_config.root) / body.source_path
        target_path = Path(repo_config.root) / body.target_path

        # Security check: prevent path traversal for both paths
        try:
            source_path = source_path.resolve()
            target_path = target_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(source_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
            if not str(target_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied: target path outside repo")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if not source_path.exists() or not source_path.is_file():
            raise HTTPException(status_code=404, detail="Source file not found")

        if target_path.exists():
            raise HTTPException(status_code=409, detail="Target already exists")

        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(source_path), str(target_path))
            return {
                "success": True,
                "source_path": body.source_path,
                "target_path": body.target_path,
            }
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.delete("/api/files/{repo}/{path:path}")
    async def delete_file(repo: str, path: str):
        """Delete a file"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        # Security check: prevent path traversal
        try:
            file_path = file_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        # Don't allow deleting directories
        if file_path.is_dir():
            raise HTTPException(
                status_code=400, detail="Cannot delete directories"
            )

        try:
            file_path.unlink()
            return {"success": True, "path": path}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
