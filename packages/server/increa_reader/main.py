"""
Main application entry point for Increa Reader Server
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

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
from .links_routes import create_links_routes
from .models import WorkspaceConfig
from .notes_routes import create_notes_routes
from .pdf_routes import create_pdf_routes
from .search_routes import create_search_routes
from .session_routes import create_session_routes
from .tags_routes import create_tags_routes
from .template_routes import create_template_routes
from .version_routes import create_version_routes
from .workspace import load_workspace_config
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

    yield

    # Shutdown
    print("\n🛑 Shutting down Increa Reader Server...")
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],  # Vite dev server
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global workspace configuration
    workspace_config = load_workspace_config()
    app.state.workspace_config = workspace_config

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
    create_links_routes(app, workspace_config)
    create_ai_routes(app, workspace_config)
    create_export_routes(app, workspace_config)
    create_version_routes(app, workspace_config)
    create_template_routes(app, workspace_config)
    create_calendar_routes(app, workspace_config)

    @app.get("/api")
    async def root():
        """Root endpoint"""
        return {"message": "Increa Reader Server (Python)"}

    @app.get("/health")
    async def health():
        """Health check endpoint"""
        return {"status": "healthy", "repos": len(workspace_config.repos)}

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
