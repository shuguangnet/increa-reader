"""
Full-text search API routes with indexing support
"""

import asyncio
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import aiofiles
from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig

# Text file extensions worth searching
TEXT_EXTENSIONS = {
    ".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".cfg", ".ini", ".sh", ".bash", ".zsh", ".html", ".css", ".scss",
    ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".rb", ".php", ".lua",
    ".sql", ".xml", ".svg", ".vue", ".svelte",
}

# Type alias for the index structure:
# repo_name -> list of (relative_file_path, [(line_number, line_text)])
SearchIndexData = Dict[str, List[Tuple[str, List[Tuple[int, str]]]]]


class SearchIndex:
    """Full-text search index built at startup and queried on search requests.

    Stores a mapping of repo_name -> [(file_path, [(line_number, line_text)])]
    so that searches can run against the in-memory index instead of walking
    the file system on every request.
    """

    def __init__(self) -> None:
        self._index: SearchIndexData = {}

    # ------------------------------------------------------------------
    # Building
    # ------------------------------------------------------------------

    async def build(self, workspace_config: WorkspaceConfig) -> None:
        """Build the index concurrently for all configured repos."""
        tasks = [
            self._build_repo(repo_config.name, Path(repo_config.root))
            for repo_config in workspace_config.repos
        ]
        results = await asyncio.gather(*tasks)
        for repo_config, repo_index in zip(workspace_config.repos, results):
            self._index[repo_config.name] = repo_index

    async def rebuild(self, workspace_config: WorkspaceConfig) -> None:
        """Re-build the entire index from scratch (v1: full rebuild)."""
        self._index.clear()
        await self.build(workspace_config)

    async def _build_repo(
        self, repo_name: str, repo_root: Path
    ) -> List[Tuple[str, List[Tuple[int, str]]]]:
        """Index all text files under *repo_root* and return the repo index."""
        if not repo_root.exists():
            return []

        file_paths: List[Path] = []
        for fp in repo_root.rglob("*"):
            if fp.is_dir():
                continue
            if any(part.startswith(".") for part in fp.relative_to(repo_root).parts):
                continue
            if "node_modules" in fp.parts:
                continue
            if fp.suffix.lower() not in TEXT_EXTENSIONS and fp.suffix:
                continue
            file_paths.append(fp)

        tasks = [self._index_file(fp, repo_root) for fp in file_paths]
        results = await asyncio.gather(*tasks)
        # Filter out empty results (unreadable / binary files)
        return [r for r in results if r is not None]

    @staticmethod
    async def _index_file(
        file_path: Path, repo_root: Path
    ) -> Optional[Tuple[str, List[Tuple[int, str]]]]:
        """Read a single file and return (rel_path, [(line_no, line_text)]) or None."""
        try:
            async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
                lines = await f.readlines()
        except (OSError, UnicodeDecodeError):
            return None

        rel_path = str(file_path.relative_to(repo_root))
        indexed_lines: List[Tuple[int, str]] = []
        for line_no, line in enumerate(lines, start=1):
            indexed_lines.append((line_no, line.rstrip("\n\r")))

        return (rel_path, indexed_lines)

    # ------------------------------------------------------------------
    # Searching
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        repos: Optional[List[str]] = None,
        file_types: Optional[List[str]] = None,
        max_results: int = 50,
    ) -> Tuple[List["SearchMatch"], int]:
        """Search the in-memory index and return (matches, total)."""
        pattern = re.compile(re.escape(query), re.IGNORECASE)
        results: List[SearchMatch] = []

        for repo_name, file_entries in self._index.items():
            if repos and repo_name not in repos:
                continue

            for rel_path, lines in file_entries:
                # Apply file-type filter
                path_suffix = Path(rel_path).suffix.lower()
                if file_types:
                    if path_suffix.lstrip(".") not in file_types:
                        continue
                else:
                    if path_suffix and path_suffix not in TEXT_EXTENSIONS:
                        continue

                for line_no, line_text in lines:
                    if pattern.search(line_text):
                        results.append(
                            SearchMatch(
                                repo=repo_name,
                                file_path=rel_path,
                                line_number=line_no,
                                line=line_text,
                            )
                        )
                        if len(results) >= max_results:
                            return results, len(results)

        return results, len(results)


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------

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


# ------------------------------------------------------------------
# Route creation
# ------------------------------------------------------------------

def create_search_routes(app, workspace_config: WorkspaceConfig):
    """Create full-text search API routes."""

    @app.get("/api/search")
    async def search_get(q: str, repo: Optional[str] = None, file_types: Optional[str] = None):
        """Simple full-text search across repositories."""
        if not q:
            raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        repos = [repo] if repo else None
        parsed_file_types = file_types.split(",") if file_types else None
        search_index: SearchIndex = app.state.search_index
        results, total = search_index.search(
            q, repos=repos, file_types=parsed_file_types, max_results=50
        )
        return {"results": results, "total": total}

    @app.post("/api/search")
    async def search_post(body: SearchRequest):
        """Advanced full-text search with filters."""
        if not body.query:
            raise HTTPException(status_code=400, detail="query is required")
        search_index: SearchIndex = app.state.search_index
        results, total = search_index.search(
            body.query, body.repos, body.file_types, body.max_results
        )
        return {"results": results, "total": total}

    @app.post("/api/search/rebuild")
    async def rebuild_search_index():
        """Rebuild the search index from scratch."""
        from fastapi.responses import JSONResponse
        search_index: SearchIndex = app.state.search_index
        await search_index.rebuild(workspace_config)
        total_files = sum(len(entries) for entries in search_index._index.values())
        return JSONResponse(
            status_code=200,
            content={"message": "Search index rebuilt successfully", "total_files": total_files},
        )