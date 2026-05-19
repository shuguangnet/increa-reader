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

from .ai_cache import _make_key, get_cached, set_cached, invalidate_prefix, clear_cache, cache_stats
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
    """调用 AI API 并返回文本响应（根据 AI_PROVIDER 自动选择 Anthropic 或 OpenAI）"""
    from .workspace import get_ai_provider, get_openai_config

    provider = get_ai_provider()

    if provider == "openai":
        return await _call_openai(prompt, max_tokens)
    else:
        return await _call_anthropic(prompt, max_tokens)


async def _call_anthropic(prompt: str, max_tokens: int = 1024) -> str:
    """调用 Anthropic Claude API 并返回文本响应"""
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


async def _call_openai(prompt: str, max_tokens: int = 1024) -> str:
    """调用 OpenAI API 并返回文本响应（使用 httpx 直接请求）"""
    from .workspace import get_openai_config

    config = get_openai_config()
    api_key = config.get("api_key", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

    # 确保 base_url 格式正确：去除尾斜杠，保证 /chat/completions 拼接正确
    base_url = config["base_url"].rstrip("/")
    # 如果用户填的 base_url 不包含 /v1 后缀，且不像已包含完整路径，自动补 /v1
    if not any(base_url.endswith(suffix) for suffix in ("/v1", "/v1/chat/completions")):
        base_url = base_url.rstrip("/") + "/v1"
    model = config["model"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }

    url = f"{base_url}/chat/completions"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=headers,
                json=body,
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as exc:
        # 尝试提取更详细的错误信息
        try:
            error_body = exc.response.json()
            error_msg = error_body.get("error", {}).get("message", str(error_body))
        except Exception:
            error_msg = f"HTTP {exc.response.status_code}"
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI API error: {error_msg}",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI API call failed: {exc}")


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
        cache_key = _make_key("summary", req.repo, req.path, str(req.max_length))
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            f"请对以下文档内容生成摘要，摘要长度不超过{req.max_length}字。"
            f"只返回摘要内容，不要任何额外说明。\n\n---\n{content}"
        )
        summary = await _call_claude(prompt)
        result = {"summary": summary.strip(), "file": f"{req.repo}/{req.path}"}
        set_cached(cache_key, result)
        return result

    @app.post("/api/ai/suggest-tags")
    async def suggest_tags(req: SuggestTagsRequest):
        """Suggest classification tags for a document using Claude."""
        cache_key = _make_key("tags", req.repo, req.path)
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            "为以下文档内容建议3-5个分类标签，只返回标签列表，"
            "每行一个，不要编号\n\n---\n" + content
        )
        result_text = await _call_claude(prompt)
        tags = [t.strip().lstrip("0123456789.-) ") for t in result_text.strip().splitlines() if t.strip()]
        result = {"tags": tags}
        set_cached(cache_key, result)
        return result

    @app.post("/api/ai/ask")
    async def ask(req: AskRequest):
        """Answer a question about a document using Claude."""
        # Cache based on file + question hash for consistent results
        cache_key = _make_key("ask", req.repo, req.path, req.question[:100])
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

        repo_config = _find_repo(workspace_config, req.repo)
        content = await _read_file_content(repo_config.root, req.path)

        prompt = (
            f"基于以下文档内容回答问题。如果文档中没有相关信息，可以说明。\n\n"
            f"---\n{content}\n\n---\n问题：{req.question}"
        )
        answer_text = await _call_claude(prompt)
        result = {"answer": answer_text.strip()}
        set_cached(cache_key, result)
        return result

    @app.post("/api/ai/related")
    async def related(req: RelatedRequest):
        """Recommend related documents using Claude."""
        cache_key = _make_key("related", req.repo, req.path, str(req.max_results))
        cached = get_cached(cache_key)
        if cached is not None:
            return cached

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

        result_data = {"related": related}
        set_cached(cache_key, result_data)
        return result_data

    @app.get("/api/ai/cache-stats")
    async def get_ai_cache_stats():
        """Get AI response cache statistics."""
        return cache_stats()

    @app.delete("/api/ai/cache")
    async def clear_ai_cache(prefix: Optional[str] = None):
        """Clear AI response cache. Optionally specify a prefix to clear selectively."""
        if prefix:
            count = invalidate_prefix(prefix)
            return {"cleared": count}
        clear_cache()
        return {"cleared": "all"}