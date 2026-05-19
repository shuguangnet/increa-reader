"""
File watcher for incremental search index and link index updates.
Uses watchfiles to monitor workspace directories for changes.
"""

import asyncio
import os
import sys
from pathlib import Path
from typing import Callable, Optional

from .models import WorkspaceConfig

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# File extensions to watch for search index updates
WATCHABLE_EXTENSIONS = {
    '.md', '.txt', '.py', '.js', '.ts', '.tsx', '.jsx', '.json',
    '.yaml', '.yml', '.toml', '.cfg', '.ini', '.sh', '.bash',
    '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
    '.html', '.css', '.scss', '.less', '.vue', '.svelte',
    '.xml', '.csv', '.log', '.conf', '.env',
    '.zig', '.nim', '.lua', '.rb', '.php', '.r', '.sql',
}


def should_watch(path: str) -> bool:
    """Check if a file should be watched based on extension."""
    return Path(path).suffix.lower() in WATCHABLE_EXTENSIONS


class IndexWatcher:
    """Watches workspace directories for file changes and triggers incremental index updates."""
    
    def __init__(
        self,
        workspace_config: WorkspaceConfig,
        on_file_changed: Optional[Callable] = None,
    ):
        self.workspace_config = workspace_config
        self.on_file_changed = on_file_changed
        self._task: Optional[asyncio.Task] = None
        self._running = False
    
    def start(self):
        """Start watching in background."""
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._watch())
        if DEBUG:
            print("📁 IndexWatcher started")
    
    def stop(self):
        """Stop watching."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        if DEBUG:
            print("📁 IndexWatcher stopped")
    
    async def _watch(self):
        """Main watch loop using watchfiles."""
        try:
            from watchfiles import awatch, Change
        except ImportError:
            print("⚠️  watchfiles not installed, file watching disabled")
            return
        
        # Collect all repo root paths
        watch_paths = [str(Path(repo.root).resolve()) for repo in self.workspace_config.repos]
        if not watch_paths:
            return
        
        if DEBUG:
            print(f"📁 Watching paths: {watch_paths}")
        
        try:
            async for changes in awatch(*watch_paths, stop_event=asyncio.Event() if not self._running else None):
                if not self._running:
                    break
                
                # Group changes by type
                changed_files: dict[str, set[str]] = {
                    'added': set(),
                    'modified': set(),
                    'deleted': set(),
                }
                
                for change_type, path in changes:
                    if not should_watch(path):
                        continue
                    
                    # Convert absolute path to repo-relative path
                    rel_path = None
                    repo_name = None
                    for repo in self.workspace_config.repos:
                        repo_root = str(Path(repo.root).resolve())
                        if path.startswith(repo_root):
                            rel_path = str(Path(path).relative_to(repo_root))
                            repo_name = repo.name
                            break
                    
                    if rel_path is None or repo_name is None:
                        continue
                    
                    if change_type == Change.added:
                        changed_files['added'].add(f"{repo_name}:{rel_path}")
                    elif change_type == Change.modified:
                        changed_files['modified'].add(f"{repo_name}:{rel_path}")
                    elif change_type == Change.deleted:
                        changed_files['deleted'].add(f"{repo_name}:{rel_path}")
                
                # Only trigger update if there are relevant changes
                total_changes = sum(len(v) for v in changed_files.values())
                if total_changes > 0 and self.on_file_changed:
                    if DEBUG:
                        print(f"📁 File changes detected: +{len(changed_files['added'])} ~{len(changed_files['modified'])} -{len(changed_files['deleted'])}")
                    try:
                        await self.on_file_changed(changed_files)
                    except Exception as e:
                        if DEBUG:
                            print(f"⚠️  Error in index update callback: {e}")
        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if DEBUG:
                print(f"⚠️  Watcher error: {e}")