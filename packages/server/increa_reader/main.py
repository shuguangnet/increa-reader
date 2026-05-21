"""
Main application entry point for Increa Reader Server
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi.staticfiles import StaticFiles

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    print(
        "Warning: python-dotenv not installed. Environment variables from .env file won't be loaded."
    )

import uvicorn
from fastapi import FastAPI

from .board_routes import create_board_routes
from .chat import cleanup_active_sessions, create_chat_routes
from .config_routes import create_config_routes

# Import local modules
from .ai_routes import create_ai_routes
from .calendar_routes import create_calendar_routes
from .export_routes import create_export_routes
from .file_routes import create_file_routes
from .link_index import LinkIndex
from .links_routes import create_links_routes
from .models import WorkspaceConfig
from .index_watcher import IndexWatcher
from .notes_routes import create_notes_routes
from .pdf_routes import create_pdf_routes
from .progress_routes import create_progress_routes
from .search_routes import SearchIndex, create_search_routes
from .session_routes import create_session_routes
from .tags_routes import create_tags_routes
from .template_routes import create_template_routes
from .version_routes import create_version_routes
from .workspace import WorkspaceTreeCache, load_workspace_config
from .workspace_routes import create_workspace_routes


def _print_startup_warnings(workspace_config: WorkspaceConfig) -> None:
    """Print helpful warnings for missing configuration"""
    if not workspace_config.repos:
        print("   ⚠ No repositories configured.")
        print("     Set INCREA_REPO in .env or configure via the UI settings panel.")

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("   ⚠ ANTHROPIC_API_KEY is not set. AI chat will not be available.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan (startup/shutdown)"""
    # Startup
    workspace_config = app.state.workspace_config
    print(f"🚀 Increa Reader Server started")
    print(f"   Repositories: {len(workspace_config.repos)}")
    for repo in workspace_config.repos:
        print(f"   - {repo.name}: {repo.root}")
    _print_startup_warnings(workspace_config)

    # Build search index
    search_index = SearchIndex()
    print("🔍 Building search index...")
    await search_index.build(workspace_config)
    total_files = sum(len(entries) for entries in search_index._index.values())
    print(f"   Search index ready: {total_files} files indexed")
    app.state.search_index = search_index

    # Build link index
    link_index = app.state.link_index
    print("🔗 Building link index...")
    await link_index.build()
    total_links = sum(
        len(targets)
        for repo_links in link_index.outgoing_links.values()
        for targets in repo_links.values()
    )
    print(f"   Link index ready: {total_links} links indexed")

    # Start file watcher for incremental index updates
    async def on_files_changed(changed_files: dict):
        """Incrementally update search and link indexes when files change."""
        search_idx: SearchIndex = app.state.search_index
        link_idx: LinkIndex = app.state.link_index
        tree_cache: WorkspaceTreeCache = app.state.workspace_tree_cache
        all_keys = set()
        changed_repos = set()
        for key_set in changed_files.values():
            all_keys.update(key_set)
        if not all_keys:
            return
        for key in all_keys:
            repo_name, file_path = key.split(':', 1)
            changed_repos.add(repo_name)
            if key in changed_files.get('deleted', set()):
                search_idx.remove_file(repo_name, file_path)
                link_idx.remove_file(repo_name, file_path)
            else:
                # added or modified — rebuild entry for this file
                from pathlib import Path as P
                repo = next((r for r in workspace_config.repos if r.name == repo_name), None)
                if repo:
                    full_path = P(repo.root) / file_path
                    repo_root = P(repo.root).resolve()
                    if full_path.exists():
                        await search_idx.update_file(repo_name, file_path, full_path, repo_root)
                        await link_idx.update_file(repo_name, file_path, full_path)
        for repo_name in changed_repos:
            repo = next((r for r in workspace_config.repos if r.name == repo_name), None)
            if repo is None:
                continue
            repo_root = Path(repo.root).resolve()
            tree_cache.apply_file_changes(
                repo_name,
                repo_root,
                added={
                    key.split(':', 1)[1]
                    for key in changed_files.get('added', set())
                    if key.startswith(f"{repo_name}:")
                },
                deleted={
                    key.split(':', 1)[1]
                    for key in changed_files.get('deleted', set())
                    if key.startswith(f"{repo_name}:")
                },
            )
        if DEBUG:
            print(f"   ✅ Indexes updated for {len(all_keys)} file changes")

    watcher = IndexWatcher(workspace_config, on_file_changed=on_files_changed)
    watcher.start()
    app.state.index_watcher = watcher

    yield

    # Shutdown
    print("\n🛑 Shutting down Increa Reader Server...")
    # Stop file watcher
    watcher = getattr(app.state, 'index_watcher', None)
    if watcher:
        watcher.stop()
    await cleanup_active_sessions()
    print("✓ Cleanup completed\n")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application"""
    app = FastAPI(
        title="Increa Reader API",
        description="A FastAPI server for increa-reader with PDF and chat capabilities",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS middleware
    from fastapi.middleware.cors import CORSMiddleware
    from starlette.middleware.base import BaseHTTPMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for development
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Security headers middleware
    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            return response

    app.add_middleware(SecurityHeadersMiddleware)

    # Global workspace configuration
    workspace_config = load_workspace_config()
    app.state.workspace_config = workspace_config
    app.state.workspace_tree_cache = WorkspaceTreeCache(workspace_config.excludes)

    # Create link index (built during lifespan startup)
    link_index = LinkIndex(workspace_config)
    app.state.link_index = link_index

    # Register all route modules
    create_config_routes(app, workspace_config)
    create_workspace_routes(app, workspace_config)
    create_file_routes(app, workspace_config)
    create_notes_routes(app, workspace_config)
    create_pdf_routes(app, workspace_config)
    create_chat_routes(app, workspace_config)
    create_board_routes(app, workspace_config)
    create_session_routes(app, workspace_config)
    create_search_routes(app, workspace_config)
    create_tags_routes(app, workspace_config)
    create_links_routes(app, workspace_config, link_index)
    create_ai_routes(app, workspace_config)
    create_export_routes(app, workspace_config)
    create_version_routes(app, workspace_config)
    create_template_routes(app, workspace_config)
    create_calendar_routes(app, workspace_config)
    create_progress_routes(app, workspace_config)

    @app.get("/api")
    async def root():
        """Root endpoint"""
        return {"message": "Increa Reader Server (Python)"}

    @app.get("/health")
    async def health():
        """Health check endpoint"""
        return {"status": "healthy", "repos": len(workspace_config.repos)}

    # Serve frontend static files (from built dist)
    ui_dist = Path(__file__).parent.parent.parent / "ui" / "dist"
    if ui_dist.is_dir():
        app.mount("/", StaticFiles(directory=str(ui_dist), html=True), name="static")

    return app


# Create the app instance for import
app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
        timeout_graceful_shutdown=5,
    )
