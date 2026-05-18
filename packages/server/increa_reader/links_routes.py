"""
Bidirectional link API routes for wiki-links and markdown links
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Set

import aiofiles
from fastapi import HTTPException

from .models import WorkspaceConfig

# [[wiki-link]] pattern
WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]")
# [text](path) markdown link pattern
MD_LINK_RE = re.compile(r"\[(?:[^\]]+)\]\(([^)]+)\)")

# Only parse markdown files
MD_EXTENSIONS = {".md", ".markdown"}


async def _parse_links(file_path: Path) -> List[str]:
    """Extract all outgoing links from a markdown file."""
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            content = await f.read()
    except (OSError, UnicodeDecodeError):
        return []
    links = []
    links.extend(m.group(1).strip() for m in WIKI_LINK_RE.finditer(content))
    for m in MD_LINK_RE.finditer(content):
        href = m.group(1).strip()
        # Skip external URLs and anchors
        if href.startswith(("http://", "https://", "#", "mailto:", "ftp://")):
            continue
        links.append(href)
    return links


def _resolve_link(source_dir: Path, link: str, repo_root: Path) -> Optional[str]:
    """Resolve a link target to a relative path within repo, or None."""
    # Remove any anchor fragment
    target = link.split("#")[0]
    if not target:
        return None
    # Absolute path within repo
    if target.startswith("/"):
        resolved = (repo_root / target.lstrip("/")).resolve()
    else:
        resolved = (source_dir / target).resolve()
    try:
        rel = str(resolved.relative_to(repo_root.resolve()))
    except ValueError:
        return None
    if not resolved.exists():
        # Try with .md extension appended
        md_resolved = Path(str(resolved) + ".md")
        if md_resolved.exists():
            return str(md_resolved.relative_to(repo_root.resolve()))
        return None
    return rel


async def _scan_repo_links(
    repo_config, workspace_config: WorkspaceConfig
) -> Dict[str, List[str]]:
    """Scan all md files in a repo, return {rel_path: [outgoing_link_paths]}."""
    repo_root = Path(repo_config.root).resolve()
    if not repo_root.exists():
        return {}
    link_map: Dict[str, List[str]] = {}
    for md_file in repo_root.rglob("*.md"):
        if any(part.startswith(".") for part in md_file.relative_to(repo_root).parts):
            continue
        if "node_modules" in md_file.parts:
            continue
        rel = str(md_file.relative_to(repo_root))
        raw_links = await _parse_links(md_file)
        resolved = []
        for link in raw_links:
            r = _resolve_link(md_file.parent, link, repo_root)
            if r:
                resolved.append(r)
        link_map[rel] = resolved
    return link_map


def create_links_routes(app, workspace_config: WorkspaceConfig):
    """Create bidirectional link API routes."""

    @app.get("/api/links/backlinks")
    async def get_backlinks(repo: str, path: str):
        """Get all files that link TO the specified file."""
        repo_config = next(
            (r for r in workspace_config.repos if r.name == repo), None
        )
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
        link_map = await _scan_repo_links(repo_config, workspace_config)
        backlinks = []
        for src, targets in link_map.items():
            if path in targets:
                backlinks.append(src)
        return {"repo": repo, "path": path, "backlinks": backlinks}

    @app.get("/api/links/outgoing")
    async def get_outgoing_links(repo: str, path: str):
        """Get all links FROM the specified file."""
        repo_config = next(
            (r for r in workspace_config.repos if r.name == repo), None
        )
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
        link_map = await _scan_repo_links(repo_config, workspace_config)
        outgoing = link_map.get(path, [])
        return {"repo": repo, "path": path, "outgoing": outgoing}

    @app.get("/api/links/graph")
    async def get_link_graph(repo: Optional[str] = None):
        """Get link graph data for knowledge graph visualization."""
        repos = workspace_config.repos
        if repo:
            repos = [r for r in repos if r.name == repo]
        nodes_set: Set[str] = set()
        edges: List[dict] = []
        for repo_cfg in repos:
            link_map = await _scan_repo_links(repo_cfg, workspace_config)
            for src, targets in link_map.items():
                node_id = f"{repo_cfg.name}:{src}"
                nodes_set.add(node_id)
                for tgt in targets:
                    target_id = f"{repo_cfg.name}:{tgt}"
                    nodes_set.add(target_id)
                    edges.append({"source": node_id, "target": target_id})
        nodes = [
            {
                "id": nid,
                "label": nid.split(":", 1)[1],
                "type": "file",
            }
            for nid in sorted(nodes_set)
        ]
        return {"nodes": nodes, "edges": edges}