"""
Workspace management and file tree functionality
"""

import json
import os
from pathlib import Path
from threading import Lock
from typing import List, Optional

from .models import RepoItem, TreeNode, WorkspaceConfig

DEFAULT_EXCLUDES = ["node_modules", ".*", "*.log"]


def get_config_path() -> Path:
    return Path.home() / ".increa-reader" / "config.json"


def load_raw_config() -> dict:
    """Read full config.json, return {} if missing or invalid"""
    config_path = get_config_path()
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_raw_config(data: dict) -> None:
    """Write full config.json"""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def save_workspace_config(repos: List[RepoItem]) -> None:
    """Save repo paths to ~/.increa-reader/config.json"""
    data = load_raw_config()
    data["repos"] = [{"path": repo.root} for repo in repos]
    save_raw_config(data)


def load_api_settings() -> dict:
    """Read config['api_settings'], return {} if absent"""
    return load_raw_config().get("api_settings", {})


def get_ai_provider() -> str:
    """确定当前 AI provider: 'anthropic' 或 'openai'

    优先级:
    1. 环境变量 AI_PROVIDER
    2. config.json 中的 api_settings.ai_provider
    3. 如果有 ANTHROPIC_API_KEY 则默认 anthropic
    4. 否则默认 openai
    """
    explicit = os.getenv("AI_PROVIDER", "").lower()
    if explicit in ("anthropic", "openai"):
        return explicit
    # 检查 config.json 中的设置
    api_settings = load_api_settings()
    config_provider = api_settings.get("ai_provider", "").lower()
    if config_provider in ("anthropic", "openai"):
        return config_provider
    # 自动检测：有 Anthropic key 则用 anthropic，否则 openai
    if os.getenv("ANTHROPIC_API_KEY") or api_settings.get("api_key"):
        return "anthropic"
    return "openai"


def build_sdk_env() -> dict[str, str]:
    """Build env dict for Claude SDK, filtering out None values"""
    api_settings = load_api_settings()
    return {
        k: v
        for k, v in {
            "ANTHROPIC_BASE_URL": api_settings.get("base_url")
            or os.getenv("ANTHROPIC_BASE_URL"),
            "ANTHROPIC_AUTH_TOKEN": os.getenv("ANTHROPIC_AUTH_TOKEN"),
            "ANTHROPIC_API_KEY": api_settings.get("api_key")
            or os.getenv("ANTHROPIC_API_KEY", ""),
        }.items()
        if v is not None
    }


def get_openai_config() -> dict[str, str]:
    """获取 OpenAI API 配置（环境变量优先于 config.json）

    返回:
        dict: 包含 api_key, base_url, model 的配置字典
    """
    api_settings = load_api_settings()
    return {
        "api_key": (
            api_settings.get("openai_api_key")
            or os.getenv("OPENAI_API_KEY", "")
        ),
        "base_url": (
            api_settings.get("openai_base_url")
            or os.getenv("OPENAI_BASE_URL")
            or "https://api.openai.com/v1"
        ),
        "model": (
            api_settings.get("openai_model")
            or os.getenv("OPENAI_MODEL")
            or "gpt-4o"
        ),
    }


def save_api_settings(settings: dict) -> None:
    """Merge api_settings into config and write"""
    data = load_raw_config()
    data["api_settings"] = settings
    save_raw_config(data)


def _load_repos_from_config() -> List[RepoItem] | None:
    """Try loading repos from config.json, return None if not found"""
    data = load_raw_config()
    if not data or "repos" not in data:
        return None
    try:
        repos = []
        for entry in data["repos"]:
            path_obj = Path(entry["path"]).resolve()
            repos.append(RepoItem(name=path_obj.name, root=str(path_obj)))
        return repos
    except KeyError:
        return None


def _load_repos_from_env() -> List[RepoItem]:
    """Load repos from INCREA_REPO environment variable"""
    increa_repo = os.getenv("INCREA_REPO", "")
    if not increa_repo:
        return []
    repos = []
    for repo_path in increa_repo.split(":"):
        repo_path = repo_path.strip()
        if not repo_path:
            continue
        path_obj = Path(repo_path).resolve()
        if path_obj.exists():
            repos.append(RepoItem(name=path_obj.name, root=str(path_obj)))
    return repos


def load_workspace_config() -> WorkspaceConfig:
    """Load workspace config: prioritize config.json, fallback to env var"""
    repos = _load_repos_from_config()
    if repos is None:
        repos = _load_repos_from_env()
    return WorkspaceConfig(title="Increa Reader", repos=repos, excludes=DEFAULT_EXCLUDES)


def is_text_file(content: bytes) -> bool:
    """Check if file content is text-based"""
    try:
        content.decode("utf-8")
        return True
    except UnicodeDecodeError:
        # Check for common binary file signatures
        binary_signatures = [
            b"\x89PNG",  # PNG
            b"\xff\xd8\xff",  # JPEG
            b"%PDF",  # PDF
            b"GIF8",  # GIF
        ]
        return not any(content.startswith(sig) for sig in binary_signatures)


def _is_excluded(name: str, excludes: List[str]) -> bool:
    return any(name.startswith(exclude.rstrip("*")) for exclude in excludes)


def _build_file_tree_scandir(
    dir_path: Path, relative_prefix: str, excludes: List[str]
) -> List[TreeNode]:
    """Build file tree with scandir to avoid redundant stat calls on large repos."""
    dir_nodes: list[TreeNode] = []
    file_nodes: list[TreeNode] = []

    try:
        with os.scandir(dir_path) as entries:
            visible_entries = [
                entry for entry in entries if not _is_excluded(entry.name, excludes)
            ]
    except (FileNotFoundError, NotADirectoryError, PermissionError):
        return []

    visible_entries.sort(key=lambda entry: entry.name.lower())

    for entry in visible_entries:
        relative_path = (
            f"{relative_prefix}/{entry.name}" if relative_prefix else entry.name
        )

        try:
            is_dir = entry.is_dir(follow_symlinks=False)
        except OSError:
            continue

        if is_dir:
            children = _build_file_tree_scandir(
                Path(entry.path), relative_path, excludes
            )
            dir_nodes.append(
                TreeNode(
                    type="dir",
                    name=entry.name,
                    path=relative_path,
                    children=children,
                )
            )
        else:
            file_nodes.append(
                TreeNode(type="file", name=entry.name, path=relative_path)
            )

    return dir_nodes + file_nodes


def build_file_tree(
    dir_path: Path, relative_to: Path, excludes: List[str]
) -> List[TreeNode]:
    """Recursively build file tree."""
    relative_prefix = ""
    if dir_path != relative_to:
        relative_prefix = str(dir_path.relative_to(relative_to))
    return _build_file_tree_scandir(dir_path, relative_prefix, excludes)


class WorkspaceTreeCache:
    """Cache workspace file trees and invalidate them incrementally on changes."""

    def __init__(self, excludes: List[str]):
        self.excludes = excludes
        self._repo_trees: dict[str, List[TreeNode]] = {}
        self._repo_versions: dict[str, int] = {}
        self._repo_payloads: dict[str, tuple[int, bytes]] = {}
        self._workspace_tree: list[dict[str, object]] | None = None
        self._workspace_version = 0
        self._workspace_payload: tuple[int, bytes] | None = None
        self._lock = Lock()

    def get_repo_tree(self, repo_name: str, repo_root: Path) -> List[TreeNode]:
        with self._lock:
            cached = self._repo_trees.get(repo_name)
            if cached is not None:
                return cached

        files = build_file_tree(repo_root, repo_root, self.excludes)

        with self._lock:
            existing = self._repo_trees.get(repo_name)
            if existing is not None:
                return existing
            self._repo_trees[repo_name] = files
            if repo_name not in self._repo_versions:
                self._repo_versions[repo_name] = 1
            self._invalidate_workspace_payload_locked()
            return files

    def get_repo_tree_payload(self, repo_name: str, repo_root: Path) -> tuple[bytes, str]:
        files = self.get_repo_tree(repo_name, repo_root)

        with self._lock:
            version = self._repo_versions.get(repo_name, 1)
            cached_payload = self._repo_payloads.get(repo_name)
            if cached_payload is not None and cached_payload[0] == version:
                payload = cached_payload[1]
            else:
                payload = json.dumps(
                    {
                        "data": {
                            "name": repo_name,
                            "files": [
                                node.model_dump(exclude_none=True) for node in files
                            ],
                        }
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
                self._repo_payloads[repo_name] = (version, payload)

        return payload, f'W/"repo-tree:{repo_name}:{version}"'

    def get_workspace_tree(self, repos: List[RepoItem]) -> List[dict[str, object]]:
        with self._lock:
            if self._workspace_tree is not None:
                return self._workspace_tree

        result: list[dict[str, object]] = []
        for repo in repos:
            repo_path = Path(repo.root)
            if repo_path.exists():
                files = self.get_repo_tree(repo.name, repo_path)
                result.append({"name": repo.name, "files": files})

        with self._lock:
            self._workspace_tree = result
            return result

    def get_workspace_tree_payload(self, repos: List[RepoItem]) -> tuple[bytes, str]:
        tree = self.get_workspace_tree(repos)

        with self._lock:
            version = self._workspace_version
            cached_payload = self._workspace_payload
            if cached_payload is not None and cached_payload[0] == version:
                payload = cached_payload[1]
            else:
                payload = json.dumps(
                    {
                        "data": [
                            {
                                "name": repo_data["name"],
                                "files": [
                                    node.model_dump(exclude_none=True)
                                    for node in repo_data["files"]
                                ],
                            }
                            for repo_data in tree
                        ]
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
                self._workspace_payload = (version, payload)

        return payload, f'W/"workspace-tree:{version}"'

    def invalidate_repo(self, repo_name: str) -> None:
        with self._lock:
            self._repo_trees.pop(repo_name, None)
            self._repo_payloads.pop(repo_name, None)
            self._repo_versions[repo_name] = self._repo_versions.get(repo_name, 0) + 1
            self._invalidate_workspace_payload_locked()

    def invalidate_all(self) -> None:
        with self._lock:
            self._repo_trees.clear()
            self._repo_payloads.clear()
            for repo_name in list(self._repo_versions):
                self._repo_versions[repo_name] += 1
            self._invalidate_workspace_payload_locked()

    def apply_file_changes(
        self,
        repo_name: str,
        repo_root: Path,
        added: set[str] | None = None,
        deleted: set[str] | None = None,
    ) -> None:
        """Incrementally update a cached repo tree for file additions/deletions."""
        added = added or set()
        deleted = deleted or set()

        with self._lock:
            tree = self._repo_trees.get(repo_name)
            if tree is None:
                return

            for file_path in sorted(deleted):
                self._remove_path(tree, file_path)

            for file_path in sorted(added):
                self._insert_path(tree, repo_root, file_path)

            self._repo_versions[repo_name] = self._repo_versions.get(repo_name, 0) + 1
            self._repo_payloads.pop(repo_name, None)
            self._invalidate_workspace_payload_locked()

    def _invalidate_workspace_payload_locked(self) -> None:
        self._workspace_tree = None
        self._workspace_version += 1
        self._workspace_payload = None

    def _remove_path(self, tree: List[TreeNode], relative_path: str) -> bool:
        parts = [part for part in relative_path.split("/") if part]
        return self._remove_parts(tree, parts)

    def _remove_parts(self, nodes: List[TreeNode], parts: list[str]) -> bool:
        if not parts:
            return False

        target = parts[0]
        for index, node in enumerate(nodes):
            if node.name != target:
                continue

            if len(parts) == 1:
                nodes.pop(index)
                return True

            if node.type != "dir" or not node.children:
                return False

            removed = self._remove_parts(node.children, parts[1:])
            if removed and not node.children:
                nodes.pop(index)
            return removed

        return False

    def _insert_path(self, tree: List[TreeNode], repo_root: Path, relative_path: str) -> None:
        full_path = repo_root / relative_path
        if not full_path.exists() or full_path.is_dir():
            return

        parts = [part for part in relative_path.split("/") if part]
        if not parts:
            return

        current_nodes = tree
        current_path_parts: list[str] = []

        for part in parts[:-1]:
            current_path_parts.append(part)
            dir_path = "/".join(current_path_parts)
            directory = self._find_node(current_nodes, part, "dir")
            if directory is None:
                directory = TreeNode(type="dir", name=part, path=dir_path, children=[])
                self._insert_sorted(current_nodes, directory)
            if directory.children is None:
                directory.children = []
            current_nodes = directory.children

        file_name = parts[-1]
        if self._find_node(current_nodes, file_name, "file") is not None:
            return

        self._insert_sorted(
            current_nodes,
            TreeNode(type="file", name=file_name, path=relative_path),
        )

    @staticmethod
    def _find_node(
        nodes: List[TreeNode], name: str, node_type: Optional[str] = None
    ) -> Optional[TreeNode]:
        for node in nodes:
            if node.name == name and (node_type is None or node.type == node_type):
                return node
        return None

    @staticmethod
    def _insert_sorted(nodes: List[TreeNode], new_node: TreeNode) -> None:
        new_key = (0 if new_node.type == "dir" else 1, new_node.name.lower())
        for index, node in enumerate(nodes):
            node_key = (0 if node.type == "dir" else 1, node.name.lower())
            if new_key < node_key:
                nodes.insert(index, new_node)
                return
        nodes.append(new_node)
