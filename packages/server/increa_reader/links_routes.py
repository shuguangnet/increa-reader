"""
Bidirectional link API routes — powered by LinkIndex (cached).
"""

from typing import Optional

from fastapi import HTTPException

from .models import WorkspaceConfig
from .link_index import LinkIndex


def create_links_routes(app, workspace_config: WorkspaceConfig, link_index: LinkIndex):
    """Create bidirectional link API routes."""

    @app.get("/api/links/backlinks")
    async def get_backlinks(repo: str, path: str):
        """Get all files that link TO the specified file."""
        repo_config = next(
            (r for r in workspace_config.repos if r.name == repo), None
        )
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
        # Auto-build index if not yet built
        if not link_index.is_built(repo):
            await link_index.rebuild_repo(repo)
        backlinks = link_index.get_backlinks(repo, path)
        return {"repo": repo, "path": path, "backlinks": backlinks}

    @app.get("/api/links/outgoing")
    async def get_outgoing_links(repo: str, path: str):
        """Get all links FROM the specified file."""
        repo_config = next(
            (r for r in workspace_config.repos if r.name == repo), None
        )
        if not repo_config:
            raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
        if not link_index.is_built(repo):
            await link_index.rebuild_repo(repo)
        outgoing = link_index.get_outgoing(repo, path)
        return {"repo": repo, "path": path, "outgoing": outgoing}

    @app.get("/api/links/graph")
    async def get_link_graph(repo: Optional[str] = None):
        """Get link graph data for knowledge graph visualization."""
        if repo and not link_index.is_built(repo):
            await link_index.rebuild_repo(repo)
        elif not repo:
            # Build all repos that aren't built yet
            for r in workspace_config.repos:
                if not link_index.is_built(r.name):
                    await link_index.rebuild_repo(r.name)
        return link_index.get_graph(repo)

    @app.post("/api/links/rebuild")
    async def rebuild_link_index(repo: Optional[str] = None):
        """Rebuild the link index for a specific repo or all repos."""
        if repo:
            await link_index.rebuild_repo(repo)
        else:
            await link_index.build()
        return {"status": "ok", "message": f"Link index rebuilt for {'repo: ' + repo if repo else 'all repos'}"}