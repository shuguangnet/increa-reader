"""
Reading progress tracking API routes
"""

import json
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig

PROGRESS_FILE = Path.home() / ".increa-reader" / "reading-progress.json"


class ProgressEntry(BaseModel):
    repo: str
    path: str
    percent: float  # 0.0 - 1.0
    scroll_y: int = 0
    last_read_at: Optional[str] = None


def _load_progress() -> dict:
    if not PROGRESS_FILE.exists():
        return {}
    try:
        return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_progress(data: dict) -> None:
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _key(repo: str, path: str) -> str:
    return f"{repo}:{path}"


def create_progress_routes(app, workspace_config: WorkspaceConfig):
    """Create reading progress API routes."""

    @app.get("/api/progress")
    async def get_progress(repo: str, path: str):
        """Get reading progress for a file."""
        data = _load_progress()
        key = _key(repo, path)
        entry = data.get(key)
        if not entry:
            return {"progress": None}
        return {"progress": entry}

    @app.put("/api/progress")
    async def update_progress(entry: ProgressEntry):
        """Update reading progress for a file."""
        from datetime import datetime, timezone

        data = _load_progress()
        key = _key(entry.repo, entry.path)

        # Clamp percent 0-1
        percent = max(0.0, min(1.0, entry.percent))
        data[key] = {
            "repo": entry.repo,
            "path": entry.path,
            "percent": percent,
            "scroll_y": entry.scroll_y,
            "last_read_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_progress(data)
        return {"success": True}

    @app.get("/api/progress/list")
    async def list_progress(repo: Optional[str] = None):
        """List reading progress for all files, optionally filtered by repo."""
        data = _load_progress()
        entries = list(data.values())
        if repo:
            entries = [e for e in entries if e.get("repo") == repo]
        # Sort by last_read_at descending
        entries.sort(key=lambda e: e.get("last_read_at", ""), reverse=True)
        return {"progress": entries}