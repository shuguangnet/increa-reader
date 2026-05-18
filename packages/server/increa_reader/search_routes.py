"""
Full-text search API routes
"""

import re
from pathlib import Path
from typing import List, Optional

import aiofiles
from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig
from .workspace import is_text_file

# Text file extensions worth searching
TEXT_EXTENSIONS = {
    ".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".cfg", ".ini", ".sh", ".bash", ".zsh", ".html", ".css", ".scss",
    ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".rb", ".php", ".lua",
    ".sql", ".xml", ".svg", ".vue", ".svelte",
}


class SearchRequest(BaseModel):
    query: str
    repos: Optional[List[str]] = None
    file_types: Optional[List[str]] = None
    max_results: int = 50


class SearchMatch(BaseModel):
    repo: str
    file_path: str
    line_number: int
    line: str


def _matches_extension(path: Path, file_types: Optional[List[str]]) -> bool:
    if not file_types:
        return path.suffix.lower() in TEXT_EXTENSIONS or not path.suffix
    return path.suffix.lower().lstrip(".") in file_types


async def _search_file(file_path: Path, pattern: re.Pattern) -> List[dict]:
    """Search a single file and return matching lines."""
    matches = []
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            for line_no, line in enumerate(await f.readlines(), start=1):
                if pattern.search(line):
                    matches.append({
                        "line_number": line_no,
                        "line": line.rstrip("\n\r"),
                    })
    except (OSError, UnicodeDecodeError):
        pass
    return matches


def create_search_routes(app, workspace_config: WorkspaceConfig):
    """Create full-text search API routes."""

    @app.get("/api/search")
    async def search_get(q: str, repo: Optional[str] = None, file_types: Optional[str] = None):
        """Simple full-text search across repositories."""
        if not q:
            raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        repos = [repo] if repo else None
        # Parse comma-separated file_types parameter
        parsed_file_types = file_types.split(",") if file_types else None
        return await _do_search(q, repos, file_types=parsed_file_types, max_results=50)

    @app.post("/api/search")
    async def search_post(body: SearchRequest):
        """Advanced full-text search with filters."""
        if not body.query:
            raise HTTPException(status_code=400, detail="query is required")
        return await _do_search(
            body.query, body.repos, body.file_types, body.max_results
        )

    async def _do_search(
        query: str,
        repos: Optional[List[str]],
        file_types: Optional[List[str]],
        max_results: int,
    ):
        pattern = re.compile(re.escape(query), re.IGNORECASE)
        results: List[SearchMatch] = []

        for repo_config in workspace_config.repos:
            if repos and repo_config.name not in repos:
                continue
            repo_root = Path(repo_config.root)
            if not repo_root.exists():
                continue

            for file_path in repo_root.rglob("*"):
                if file_path.is_dir():
                    continue
                # Skip hidden / node_modules
                if any(part.startswith(".") for part in file_path.relative_to(repo_root).parts):
                    continue
                if "node_modules" in file_path.parts:
                    continue
                if not _matches_extension(file_path, file_types):
                    continue

                for match in await _search_file(file_path, pattern):
                    rel_path = str(file_path.relative_to(repo_root))
                    results.append(SearchMatch(
                        repo=repo_config.name,
                        file_path=rel_path,
                        line_number=match["line_number"],
                        line=match["line"],
                    ))
                    if len(results) >= max_results:
                        return {"results": results, "total": len(results)}

        return {"results": results, "total": len(results)}