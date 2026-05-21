"""
Workspace API routes
"""

from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import Response

from .models import WorkspaceConfig


def _client_has_fresh_copy(request: Request, etag: str) -> bool:
    return request.headers.get("if-none-match") == etag


def create_workspace_routes(app, workspace_config: WorkspaceConfig):
    """Create workspace-related API routes"""
    tree_cache = app.state.workspace_tree_cache

    @app.get("/api/workspace/repos")
    async def get_repos():
        """Get list of repositories"""
        return {"data": [{"name": repo.name, "root": repo.root} for repo in workspace_config.repos]}

    @app.get("/api/workspace/repos/{repo_name}/tree")
    async def get_repo_tree(request: Request, repo_name: str):
        """Get file tree for a specific repository"""
        repo = next((r for r in workspace_config.repos if r.name == repo_name), None)
        if not repo:
            raise HTTPException(status_code=404, detail=f"Repository '{repo_name}' not found")

        repo_path = Path(repo.root)
        if not repo_path.exists():
            raise HTTPException(status_code=404, detail=f"Repository path does not exist: {repo.root}")

        payload, etag = tree_cache.get_repo_tree_payload(repo.name, repo_path)
        headers = {
            "ETag": etag,
            "Cache-Control": "private, max-age=0, must-revalidate",
        }
        if _client_has_fresh_copy(request, etag):
            return Response(status_code=304, headers=headers)
        return Response(content=payload, media_type="application/json", headers=headers)

    @app.get("/api/workspace/tree")
    async def get_workspace_tree(request: Request):
        """Get workspace file tree (legacy endpoint, kept for backward compatibility)"""
        payload, etag = tree_cache.get_workspace_tree_payload(workspace_config.repos)
        headers = {
            "ETag": etag,
            "Cache-Control": "private, max-age=0, must-revalidate",
        }
        if _client_has_fresh_copy(request, etag):
            return Response(status_code=304, headers=headers)
        return Response(content=payload, media_type="application/json", headers=headers)
