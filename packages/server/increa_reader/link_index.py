"""
Link index for wiki-links and markdown links — cached, with rebuild support.
"""

import asyncio
import re
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

import aiofiles

from .models import WorkspaceConfig

# [[wiki-link]] pattern
WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]")
# [text](path) markdown link pattern
MD_LINK_RE = re.compile(r"\[(?:[^\]]+)\]\(([^)]+)\)")

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
        if href.startswith(("http://", "https://", "#", "mailto:", "ftp://")):
            continue
        links.append(href)
    return links


def _resolve_link(source_dir: Path, link: str, repo_root: Path) -> Optional[str]:
    """Resolve a link target to a relative path within repo, or None."""
    target = link.split("#")[0]
    if not target:
        return None
    if target.startswith("/"):
        resolved = (repo_root / target.lstrip("/")).resolve()
    else:
        resolved = (source_dir / target).resolve()
    try:
        rel = str(resolved.relative_to(repo_root.resolve()))
    except ValueError:
        return None
    if not resolved.exists():
        md_resolved = Path(str(resolved) + ".md")
        if md_resolved.exists():
            return str(md_resolved.relative_to(repo_root.resolve()))
        return None
    return rel


async def _scan_repo_links(repo_config) -> Dict[str, List[str]]:
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


class LinkIndex:
    """Cached link index with rebuild support.

    Stores:
    - outgoing_links: {repo_name: {rel_path: [resolved_target_paths]}}
    - backlinks_cache: {repo_name: {target_path: [source_paths]}}
    - graph_cache: {repo_name: {nodes, edges}}
    """

    def __init__(self, workspace_config: WorkspaceConfig):
        self.workspace_config = workspace_config
        self.outgoing_links: Dict[str, Dict[str, List[str]]] = {}
        self.backlinks_cache: Dict[str, Dict[str, List[str]]] = {}
        self._build_time: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def build(self):
        """Build link index for all repos."""
        async with self._lock:
            await self._do_build()

    async def _do_build(self):
        """Internal build without lock (caller must hold lock)."""
        for repo_config in self.workspace_config.repos:
            repo_name = repo_config.name
            link_map = await _scan_repo_links(repo_config)
            self.outgoing_links[repo_name] = link_map

            # Build reverse index (backlinks)
            backlinks: Dict[str, List[str]] = {}
            for src, targets in link_map.items():
                for tgt in targets:
                    backlinks.setdefault(tgt, []).append(src)
            self.backlinks_cache[repo_name] = backlinks
            self._build_time[repo_name] = time.time()

    async def rebuild_repo(self, repo_name: str):
        """Rebuild index for a single repo."""
        async with self._lock:
            repo_config = next(
                (r for r in self.workspace_config.repos if r.name == repo_name), None
            )
            if not repo_config:
                return
            link_map = await _scan_repo_links(repo_config)
            self.outgoing_links[repo_name] = link_map

            backlinks: Dict[str, List[str]] = {}
            for src, targets in link_map.items():
                for tgt in targets:
                    backlinks.setdefault(tgt, []).append(src)
            self.backlinks_cache[repo_name] = backlinks
            self._build_time[repo_name] = time.time()

    def get_outgoing(self, repo_name: str, path: str) -> List[str]:
        """Get outgoing links for a file."""
        return self.outgoing_links.get(repo_name, {}).get(path, [])

    def get_backlinks(self, repo_name: str, path: str) -> List[str]:
        """Get backlinks (files that link TO this file)."""
        return self.backlinks_cache.get(repo_name, {}).get(path, [])

    def get_graph(self, repo_name: Optional[str] = None) -> dict:
        """Get graph data for knowledge graph visualization."""
        nodes_set: Set[str] = set()
        edges: List[dict] = []

        repos_to_scan = (
            {repo_name: self.outgoing_links.get(repo_name, {})}
            if repo_name
            else self.outgoing_links
        )

        for rname, link_map in repos_to_scan.items():
            for src, targets in link_map.items():
                node_id = f"{rname}:{src}"
                nodes_set.add(node_id)
                for tgt in targets:
                    target_id = f"{rname}:{tgt}"
                    nodes_set.add(target_id)
                    edges.append({"source": node_id, "target": target_id})

        nodes = [
            {"id": nid, "label": nid.split(":", 1)[1], "type": "file"}
            for nid in sorted(nodes_set)
        ]
        return {"nodes": nodes, "edges": edges}

    def is_built(self, repo_name: str) -> bool:
        """Check if index is built for a repo."""
        return repo_name in self.outgoing_links