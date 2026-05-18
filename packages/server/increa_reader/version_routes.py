"""
Version history (git) API routes
"""

import asyncio
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig


def _find_repo(workspace_config: WorkspaceConfig, repo: str):
    """Find a repo by name, raise 404 if not found."""
    repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
    if not repo_config:
        raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
    return repo_config


def _safe_path(repo_root: str, path: str) -> Path:
    """Resolve path and ensure it stays inside the repo."""
    file_path = Path(repo_root) / path
    try:
        file_path = file_path.resolve()
        repo_root_resolved = Path(repo_root).resolve()
        if not str(file_path).startswith(str(repo_root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    return file_path


def _validate_hash(hash_str: str) -> str:
    """Validate a git hash to prevent injection."""
    # Only allow hex characters
    if not all(c in "0123456789abcdef" for c in hash_str.lower()):
        raise HTTPException(status_code=400, detail="Invalid hash format")
    return hash_str


async def _run_git(cwd: str, *args: str) -> str:
    """Run a git command asynchronously and return stdout."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
    except FileNotFoundError:
        raise HTTPException(status_code=501, detail="git is not installed")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="git command timed out")

    if proc.returncode != 0:
        # Not a git repo or other git error
        return ""
    return stdout.decode("utf-8", errors="replace").strip()


def create_version_routes(app, workspace_config: WorkspaceConfig):
    """Create version history (git) API routes."""

    # Register the /diff route BEFORE the /{path:path} catch-all
    # so that "diff" is not captured as a path parameter.
    @app.get("/api/versions/{repo}/diff")
    async def get_version_diff(repo: str, path: str, _from: str, _to: str):
        """Compare two versions of a file."""
        repo_config = _find_repo(workspace_config, repo)

        # Validate inputs
        _safe_path(repo_config.root, path)
        hash_from = _validate_hash(_from)
        hash_to = _validate_hash(_to)

        # Check if repo has a .git directory
        git_dir = Path(repo_config.root) / ".git"
        if not git_dir.exists():
            return {"diff": ""}

        output = await _run_git(
            repo_config.root, "diff", hash_from, hash_to, "--", path
        )
        return {"diff": output}

    @app.get("/api/versions/{repo}/{path:path}")
    async def get_version_history(repo: str, path: str, hash: Optional[str] = None):
        """Get file version history or specific version content.

        If `hash` query param is provided, return content for that version.
        Otherwise return git log history.
        """
        repo_config = _find_repo(workspace_config, repo)
        _safe_path(repo_config.root, path)

        # Check if repo has a .git directory
        git_dir = Path(repo_config.root) / ".git"
        if not git_dir.exists():
            if hash:
                return {"content": "", "hash": hash}
            return {"versions": []}

        if hash:
            # Return specific version content
            _validate_hash(hash)
            output = await _run_git(
                repo_config.root, "show", f"{hash}:{path}"
            )
            return {"content": output, "hash": hash}

        # Return version history via git log
        output = await _run_git(
            repo_config.root,
            "log",
            "--oneline",
            "-20",
            "--format=%H|%s|%ai|%an",
            "--",
            path,
        )
        if not output:
            return {"versions": []}

        versions = []
        for line in output.splitlines():
            parts = line.split("|", 3)
            if len(parts) < 4:
                continue
            versions.append(
                {
                    "hash": parts[0],
                    "message": parts[1],
                    "date": parts[2].split(" ")[0] if parts[2] else "",
                    "author": parts[3],
                }
            )
        return {"versions": versions}