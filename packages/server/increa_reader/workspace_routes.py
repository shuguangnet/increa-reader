"""
Workspace API routes
"""

from pathlib import Path

from fastapi import HTTPException

from .models import RepoResource, WorkspaceConfig


def create_workspace_routes(app, workspace_config: WorkspaceConfig):
    """Create workspace-related API routes"""
    tree_cache = app.state.workspace_tree_cache

    @app.get("/api/workspace/repos")
    async def get_repos():
        """Get list of repositories"""
        return {"data": [{"name": repo.name, "root": repo.root} for repo in workspace_config.repos]}

    @app.get("/api/workspace/repos/{repo_name}/tree")
    async def get_repo_tree(repo_name: str):
        """Get file tree for a specific repository"""
        repo = next((r for r in workspace_config.repos if r.name == repo_name), None)
        if not repo:
            raise HTTPException(status_code=404, detail=f"Repository '{repo_name}' not found")

        repo_path = Path(repo.root)
        if not repo_path.exists():
            raise HTTPException(status_code=404, detail=f"Repository path does not exist: {repo.root}")

        files = tree_cache.get_repo_tree(repo.name, repo_path)
        return {"data": {"name": repo.name, "files": files}}

    @app.get("/api/workspace/tree")
    async def get_workspace_tree():
        """Get workspace file tree (legacy endpoint, kept for backward compatibility)"""
        result = [RepoResource(**repo_data) for repo_data in tree_cache.get_workspace_tree(workspace_config.repos)]
        return {"data": result}
