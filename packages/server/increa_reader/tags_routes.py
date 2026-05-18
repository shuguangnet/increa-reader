"""
Tag system API routes
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig

TAGS_FILE = Path.home() / ".increa-reader" / "tags.json"


class TagAction(BaseModel):
    file_path: str
    repo: str
    tags: List[str]


def _load_tags() -> Dict[str, List[dict]]:
    if not TAGS_FILE.exists():
        return {}
    try:
        data = json.loads(TAGS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_tags(data: Dict[str, List[dict]]) -> None:
    TAGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    TAGS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


async def _extract_frontmatter_tags(file_path: Path) -> List[str]:
    """Extract tags from YAML frontmatter of a markdown file."""
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            content = await f.read()
    except (OSError, UnicodeDecodeError):
        return []
    if not content.startswith("---"):
        return []
    end = content.find("---", 3)
    if end == -1:
        return []
    frontmatter = content[3:end]
    for line in frontmatter.splitlines():
        line = line.strip()
        if line.lower().startswith("tags:"):
            tag_value = line.split(":", 1)[1].strip()
            # YAML list: [tag1, tag2] or inline
            if tag_value.startswith("[") and tag_value.endswith("]"):
                items = tag_value[1:-1].split(",")
                return [t.strip().strip("'\"") for t in items if t.strip()]
            return [tag_value.strip().strip("'\"")] if tag_value else []
    return []


def create_tags_routes(app, workspace_config: WorkspaceConfig):
    """Create tag system API routes."""

    @app.get("/api/tags")
    async def list_tags():
        """Get all tags with file counts."""
        data = _load_tags()
        result = []
        for tag_name, files in data.items():
            result.append({"name": tag_name, "count": len(files)})
        result.sort(key=lambda x: x["name"].lower())
        return {"tags": result}

    @app.get("/api/tags/{tag_name}")
    async def get_tag_files(tag_name: str):
        """Get all files under a specific tag."""
        data = _load_tags()
        files = data.get(tag_name, [])
        # Also scan repos for frontmatter tags
        frontmatter_files = await _find_frontmatter_tag(tag_name, workspace_config)
        # Merge, deduplicating by repo+file_path
        seen = {(f["repo"], f["file_path"]) for f in files}
        for fm in frontmatter_files:
            if (fm["repo"], fm["file_path"]) not in seen:
                files.append(fm)
        return {"tag": tag_name, "files": files}

    @app.post("/api/tags")
    async def add_tags(action: TagAction):
        """Add tags to a file."""
        data = _load_tags()
        entry = {"repo": action.repo, "file_path": action.file_path}
        for tag in action.tags:
            tag = tag.strip()
            if not tag:
                continue
            files = data.setdefault(tag, [])
            if entry not in files:
                files.append(entry)
        _save_tags(data)
        return {"success": True}

    @app.delete("/api/tags")
    async def remove_tags(action: TagAction):
        """Remove tags from a file."""
        data = _load_tags()
        entry = {"repo": action.repo, "file_path": action.file_path}
        for tag in action.tags:
            tag = tag.strip()
            if tag in data and entry in data[tag]:
                data[tag].remove(entry)
                if not data[tag]:
                    del data[tag]
        _save_tags(data)
        return {"success": True}


async def _find_frontmatter_tag(
    tag_name: str, workspace_config: WorkspaceConfig
) -> List[dict]:
    """Find all markdown files whose frontmatter contains the given tag."""
    results = []
    for repo_config in workspace_config.repos:
        repo_root = Path(repo_config.root)
        if not repo_root.exists():
            continue
        for md_file in repo_root.rglob("*.md"):
            if any(part.startswith(".") for part in md_file.relative_to(repo_root).parts):
                continue
            if "node_modules" in md_file.parts:
                continue
            tags = await _extract_frontmatter_tags(md_file)
            if tag_name in tags:
                results.append({
                    "repo": repo_config.name,
                    "file_path": str(md_file.relative_to(repo_root)),
                })
    return results