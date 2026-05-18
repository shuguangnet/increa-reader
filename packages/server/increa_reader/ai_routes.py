"""
AI-assisted feature routes (summarize, suggest-tags, ask, related)
"""

import json
from pathlib import Path
from typing import List, Optional

import aiofiles
import httpx
from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig
from .workspace import build_sdk_env


# --- Request models ---


class SummarizeRequest(BaseModel):
    repo: str
    path: str
    max_length: int = 200


class SuggestTagsRequest(BaseModel):
    repo: str
    path: str


class AskRequest(BaseModel):
    repo: str
    path: str
    question: str


class RelatedRequest(BaseModel):
    repo: str
    path: str
    max_results: int = 5


# --- Helpers ---


def _find_repo(workspace_config: WorkspaceConfig, repo: str):
    """Find a repo by name, raise 404 if not found."""
    repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
    if not repo_config:
        raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
    return repo_config


async def _read_file_content(repo_root: str, path: str) -> str:
    """Read text file content, raise 404/400 on errors."""
    file_path = Path(repo_root) / path
    # Security: prevent path traversal
    try:
        file_path = file_path.resolve()
        repo_root_resolved = Path(repo_root).resolve()
        if not str(file_path).startswith(str(repo_root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            return await f.read()
    except (OSError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Cannot read file content")


async def _call_claude(prompt: str, max_tokens: int = 1024) -> str:
    """Call Claude API and return the text response."""
    env = build_sdk_env()
    api_key = env.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    base_url = env.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{base_url}/v1/messages",
                headers=headers,
                json=body,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude API error: {exc.response.status_code}",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude API call failed: {exc}")


def _collect_text_files(repo_root: str, limit: int = 100) -> List[str]:
    """Collect paths of text/markdown files in the repo (relative paths)."""
    repo_path = Path(repo_root)
    text_extensions = {
        ".md", ".markdown", ".txt", ".rst", ".adoc",
        ".py", ".js", ".ts", ".jsx", ".tsx", ".java",
        ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
        ".sh", ".bash", ".zsh", ".yaml", ".yml",
        ".json", ".toml", ".cfg", ".ini", ".xml",
        ".html", ".css", ".scss", ".vue", ".svelte",
    }
    results: List[str] = []
    try:
        for item in repo_path.rglob("*"):
            if len(results) >= limit:
                break
            # Skip hidden / node_modules
            if any(part.startswith(".") for part in item.relative_to(repo_path).parts):
                continue
            if "node_modules" in item.parts:
                continue
            if item.is_file() and item.suffix.lower() in text_extensions:
                results.append(str(item.relative_to(repo_path)))
    except PermissionError:
        pass
    return results


# --- Route factory ---


def create_ai_routes(app, workspace_config: WorkspaceConfig):
    """Create AI-assisted feature API routes."""

    @app.post("/api/ai/summarize")
    async def summarize(req: SummarizeRequest):
        """Generate a summary of a document using Claude."""
        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            f"请对以下文档内容生成摘要，摘要长度不超过{req.max_length}字。"
            f"只返回摘要内容，不要任何额外说明。\n\n---\n{content}"
        )
        summary = await _call_claude(prompt)
        return {"summary": summary.strip(), "file": f"{req.repo}/{req.path}"}

    @app.post("/api/ai/suggest-tags")
    async def suggest_tags(req: SuggestTagsRequest):
        """Suggest classification tags for a document using Claude."""
        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            "为以下文档内容建议3-5个分类标签，只返回标签列表，"
            "每行一个，不要编号\n\n---\n" + content
        )
        result = await _call_claude(prompt)
        tags = [t.strip().lstrip("0123456789.-) ") for t in result.strip().splitlines() if t.strip()]
        return {"tags": tags}

    @app.post("/api/ai/ask")
    async def ask(req: AskRequest):
        """Answer a question about a document using Claude."""
        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            f"基于以下文档内容回答问题。如果文档中没有相关信息，可以说明。\n\n"
            f"---\n{content}\n\n---\n问题：{req.question}"
        )
        answer = await _call_claude(prompt)
        return {"answer": answer.strip()}

    @app.post("/api/ai/related")
    async def related(req: RelatedRequest):
        """Recommend related documents using Claude."""
        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        # Collect other text files in the repo
        all_files = _collect_text_files(repo_config.root, limit=100)
        # Remove the current file
        other_files = [f for f in all_files if f != req.path][:99]

        if not other_files:
            return {"related": []}

        # Read snippets from other files (first ~200 chars each)
        file_summaries: List[str] = []
        for rel_path in other_files:
            try:
                fp = Path(repo_config.root) / rel_path
                async with aiofiles.open(fp, "r", encoding="utf-8") as f:
                    snippet = (await f.read())[:200]
                file_summaries.append(f"[{rel_path}]: {snippet}")
            except (OSError, UnicodeDecodeError):
                continue

        combined = "\n".join(file_summaries)
        prompt = (
            f"当前文档路径: {req.path}\n当前文档内容摘要:\n{content[:500]}\n\n"
            f"以下是同仓库中的其他文件及其内容片段:\n{combined}\n\n"
            f"请从中选出与当前文档最相关的{req.max_results}个文件，"
            f"返回JSON数组，每个元素包含repo、path和reason字段。"
            f"repo值为'{req.repo}'。只返回JSON数组，不要其他内容。"
        )
        result = await _call_claude(prompt, max_tokens=2048)

        # Parse JSON from response
        try:
            # Try to extract JSON array from the response
            text = result.strip()
            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                related = json.loads(text[start:end])
            else:
                related = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            related = []

        return {"related": related}