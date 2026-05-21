from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from increa_reader.main import create_app
from increa_reader.models import TreeNode
from increa_reader.workspace import WorkspaceTreeCache, build_file_tree


def _build_client(tmp_path, monkeypatch):
    repo_root = tmp_path / "demo-repo"
    repo_root.mkdir()
    (repo_root / "docs").mkdir()
    (repo_root / "docs" / "guide.md").write_text("# Guide\n\nHello world\n", encoding="utf-8")

    monkeypatch.setenv("INCREA_REPO", str(repo_root))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("HOME", str(tmp_path))

    app = create_app()
    return TestClient(app), repo_root


def test_notes_crud_roundtrip(tmp_path, monkeypatch):
    client, repo_root = _build_client(tmp_path, monkeypatch)

    response = client.get("/api/notes", params={"repo": "demo-repo", "path": "docs/guide.md"})
    assert response.status_code == 200
    assert response.json() == {"notes": []}

    payload = {
        "repo": "demo-repo",
        "path": "docs/guide.md",
        "note": {
            "color": "yellow",
            "content": "Remember this section",
            "position": {
                "headingPath": ["Guide"],
                "blockText": "Hello world",
                "blockIndex": 1,
                "xRatio": 0.3,
                "yRatio": 0.4,
            },
        },
    }

    create_response = client.post("/api/notes", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()["note"]
    assert created["id"].startswith("note_")
    assert created["content"] == "Remember this section"

    notes_file = repo_root / ".increa" / "notes.json"
    assert notes_file.exists()

    get_response = client.get("/api/notes", params={"repo": "demo-repo", "path": "docs/guide.md"})
    assert get_response.status_code == 200
    assert len(get_response.json()["notes"]) == 1

    update_payload = {
        "repo": "demo-repo",
        "path": "docs/guide.md",
        "note": {
            "color": "blue",
            "content": "Updated note content",
            "position": {
                "headingPath": ["Guide"],
                "blockText": "Hello world",
                "blockIndex": 1,
                "xRatio": 0.5,
                "yRatio": 0.6,
            },
        },
    }
    update_response = client.put(f"/api/notes/{created['id']}", json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()["note"]
    assert updated["id"] == created["id"]
    assert updated["color"] == "blue"
    assert updated["content"] == "Updated note content"

    delete_response = client.delete(
        f"/api/notes/{created['id']}",
        params={"repo": "demo-repo", "path": "docs/guide.md"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json() == {"success": True}

    final_response = client.get("/api/notes", params={"repo": "demo-repo", "path": "docs/guide.md"})
    assert final_response.status_code == 200
    assert final_response.json() == {"notes": []}


def test_empty_content_and_invalid_path(tmp_path, monkeypatch):
    client, _ = _build_client(tmp_path, monkeypatch)

    create_response = client.post(
        "/api/notes",
        json={
            "repo": "demo-repo",
            "path": "docs/guide.md",
            "note": {
                "color": "yellow",
                "content": "   ",
                "position": {"blockIndex": 0, "xRatio": 0.1, "yRatio": 0.2},
            },
        },
    )
    assert create_response.status_code == 400

    valid_create = client.post(
        "/api/notes",
        json={
            "repo": "demo-repo",
            "path": "docs/guide.md",
            "note": {
                "color": "yellow",
                "content": "Keep me",
                "position": {"blockIndex": 0, "xRatio": 0.1, "yRatio": 0.2},
            },
        },
    )
    note_id = valid_create.json()["note"]["id"]

    clear_response = client.put(
        f"/api/notes/{note_id}",
        json={
            "repo": "demo-repo",
            "path": "docs/guide.md",
            "note": {
                "color": "yellow",
                "content": "",
                "position": {"blockIndex": 0, "xRatio": 0.1, "yRatio": 0.2},
            },
        },
    )
    assert clear_response.status_code == 200
    assert clear_response.json() == {"deleted": True}

    invalid_path_response = client.get(
        "/api/notes",
        params={"repo": "demo-repo", "path": "../secret.md"},
    )
    assert invalid_path_response.status_code == 403


def test_invalid_color_is_rejected(tmp_path, monkeypatch):
    client, _ = _build_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/notes",
        json={
            "repo": "demo-repo",
            "path": "docs/guide.md",
            "note": {
                "color": "orange",
                "content": "Bad color",
                "position": {"blockIndex": 0, "xRatio": 0.1, "yRatio": 0.2},
            },
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "note.color is invalid"


@pytest.mark.parametrize("endpoint", ["/api/workspace/tree", "/api/workspace/repos/demo-repo/tree"])
def test_workspace_tree_cache_reflects_file_changes(tmp_path, monkeypatch, endpoint):
    client, repo_root = _build_client(tmp_path, monkeypatch)

    first_response = client.get(endpoint)
    assert first_response.status_code == 200

    docs_dir = repo_root / "docs"
    new_file = docs_dir / "later.md"
    new_file.write_text("# Later\n", encoding="utf-8")

    second_response = client.get(endpoint)
    assert second_response.status_code == 200
    payload = second_response.json()["data"]

    if endpoint == "/api/workspace/tree":
        files = payload[0]["files"]
    else:
        files = payload["files"]

    docs_node = next(node for node in files if node["path"] == "docs")
    child_paths = {child["path"] for child in docs_node["children"]}
    assert "docs/later.md" not in child_paths

    app = client.app
    app.state.workspace_tree_cache.invalidate_repo("demo-repo")

    refreshed_response = client.get(endpoint)
    assert refreshed_response.status_code == 200
    refreshed_payload = refreshed_response.json()["data"]

    if endpoint == "/api/workspace/tree":
        refreshed_files = refreshed_payload[0]["files"]
    else:
        refreshed_files = refreshed_payload["files"]

    refreshed_docs = next(node for node in refreshed_files if node["path"] == "docs")
    refreshed_child_paths = {child["path"] for child in refreshed_docs["children"]}
    assert "docs/later.md" in refreshed_child_paths


def test_build_file_tree_keeps_directories_before_files(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / "b-file.md").write_text("# B\n", encoding="utf-8")
    (repo_root / "a-dir").mkdir()
    (repo_root / "c-dir").mkdir()
    (repo_root / "a-file.md").write_text("# A\n", encoding="utf-8")

    tree = build_file_tree(repo_root, repo_root, ["node_modules", ".*", "*.log"])

    assert [node.path for node in tree] == [
        "a-dir",
        "c-dir",
        "a-file.md",
        "b-file.md",
    ]


def test_workspace_tree_cache_apply_file_changes_updates_cached_tree(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    docs_dir = repo_root / "docs"
    docs_dir.mkdir()
    (docs_dir / "guide.md").write_text("# Guide\n", encoding="utf-8")

    cache = WorkspaceTreeCache(["node_modules", ".*", "*.log"])
    tree = cache.get_repo_tree("repo", repo_root)
    docs_node = next(node for node in tree if node.path == "docs")
    assert [child.path for child in docs_node.children or []] == ["docs/guide.md"]

    (docs_dir / "later.md").write_text("# Later\n", encoding="utf-8")
    cache.apply_file_changes("repo", repo_root, added={"docs/later.md"})

    docs_node_after_add = next(node for node in tree if node.path == "docs")
    assert [child.path for child in docs_node_after_add.children or []] == [
        "docs/guide.md",
        "docs/later.md",
    ]

    (repo_root / "z-last.md").write_text("# Z\n", encoding="utf-8")
    cache.apply_file_changes("repo", repo_root, added={"z-last.md"})
    assert [node.path for node in tree] == ["docs", "z-last.md"]

    cache.apply_file_changes("repo", repo_root, deleted={"docs/guide.md"})
    docs_node_after_delete = next(node for node in tree if node.path == "docs")
    assert [child.path for child in docs_node_after_delete.children or []] == ["docs/later.md"]


def test_workspace_tree_cache_apply_file_changes_removes_empty_directories(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    cache = WorkspaceTreeCache(["node_modules", ".*", "*.log"])
    tree = [
        TreeNode(
            type="dir",
            name="docs",
            path="docs",
            children=[TreeNode(type="file", name="guide.md", path="docs/guide.md")],
        )
    ]
    cache._repo_trees["repo"] = tree

    cache.apply_file_changes("repo", repo_root, deleted={"docs/guide.md"})

    assert tree == []
