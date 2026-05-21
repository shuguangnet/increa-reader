"""PDF viewing and processing API routes"""

import json
import tempfile
from email.utils import formatdate
from pathlib import Path
from typing import Any, Dict

import fitz  # PyMuPDF
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

from .models import WorkspaceConfig
from .pdf_processor import extract_page_markdown, render_page_svg


def _build_pdf_cache_headers(file_path: Path, page: int, variant: str) -> dict[str, str]:
    stat = file_path.stat()
    etag = f'W/"{variant}:{page}:{stat.st_mtime_ns}:{stat.st_size}"'
    return {
        "ETag": etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Last-Modified": formatdate(stat.st_mtime, usegmt=True),
    }


def _client_has_fresh_copy(request: Request, headers: dict[str, str]) -> bool:
    if_none_match = request.headers.get("if-none-match")
    return if_none_match == headers["ETag"]


def _json_response(payload: dict[str, Any], headers: dict[str, str]) -> Response:
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/json",
        headers=headers,
    )


async def get_pdf_metadata(file_path: Path, path: str) -> Dict[str, Any]:
    """获取PDF文件的元数据"""
    try:
        doc = fitz.open(file_path)

        # 提取元数据
        metadata = doc.metadata

        return {
            "type": "pdf",
            "path": path,
            "metadata": {
                "page_count": doc.page_count,
                "title": metadata.get("title", ""),
                "author": metadata.get("author", ""),
                "subject": metadata.get("subject", ""),
                "creator": metadata.get("creator", ""),
                "producer": metadata.get("producer", ""),
                "creation_date": metadata.get("creationDate", ""),
                "modification_date": metadata.get("modDate", ""),
                "encrypted": doc.is_encrypted,
            },
        }
    except Exception as e:
        # 如果无法读取PDF元数据，返回基本信息
        return {
            "type": "pdf",
            "path": path,
            "metadata": {"page_count": 0, "error": f"无法读取PDF元数据: {str(e)}"},
        }


def create_pdf_routes(app, workspace_config: WorkspaceConfig):
    """Create PDF-related API routes"""

    @app.get("/api/pdf/page")
    async def get_pdf_page_content(request: Request, repo: str, path: str, page: int):
        """获取PDF指定页面的Markdown内容"""
        # Find repository
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        # 确保是PDF文件
        if file_path.suffix.lower() != ".pdf":
            raise HTTPException(status_code=400, detail="Not a PDF file")

        # 验证页码
        if page < 1:
            raise HTTPException(status_code=400, detail="Page number must be >= 1")

        headers = _build_pdf_cache_headers(file_path, page, "markdown")
        if _client_has_fresh_copy(request, headers):
            return Response(status_code=304, headers=headers)

        try:
            # 使用PDF处理器提取页面内容
            result = extract_page_markdown(str(file_path), page)

            return Response(
                content=(
                    "{"
                    f'"type":"markdown",'
                    f'"body":{__import__("json").dumps(result["markdown"], ensure_ascii=False)},'
                    f'"page":{result["page"]},'
                    f'"has_tables":{str(result["has_tables"]).lower()},'
                    f'"has_images":{str(result["has_images"]).lower()},'
                    f'"estimated_reading_time":{result["estimated_reading_time"]}'
                    "}"
                ),
                media_type="application/json",
                headers=headers,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to process PDF page: {str(e)}"
            )

    @app.get("/api/pdf/page-render")
    async def get_pdf_page_render(request: Request, repo: str, path: str, page: int):
        """渲染PDF页面为SVG矢量图"""
        # Find repository
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        # 确保是PDF文件
        if file_path.suffix.lower() != ".pdf":
            raise HTTPException(status_code=400, detail="Not a PDF file")

        # 验证页码
        if page < 1:
            raise HTTPException(status_code=400, detail="Page number must be >= 1")

        headers = _build_pdf_cache_headers(file_path, page, "svg")
        if _client_has_fresh_copy(request, headers):
            return Response(status_code=304, headers=headers)

        try:
            svg_content = render_page_svg(str(file_path), page)
            return Response(
                content=svg_content,
                media_type="image/svg+xml",
                headers=headers,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to render PDF page: {str(e)}"
            )

    @app.get("/api/pdf/extract-region")
    async def extract_pdf_region(
        repo: str,
        path: str,
        page: int,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
    ):
        """提取PDF页面指定矩形区域内的文字"""
        repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        file_path = Path(repo_config.root) / path

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        if file_path.suffix.lower() != ".pdf":
            raise HTTPException(status_code=400, detail="Not a PDF file")

        if page < 1:
            raise HTTPException(status_code=400, detail="Page number must be >= 1")

        try:
            doc = fitz.open(file_path)
            if page > doc.page_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page} exceeds total pages ({doc.page_count})",
                )
            pdf_page = doc[page - 1]
            clip = fitz.Rect(x0, y0, x1, y1)
            text = pdf_page.get_text("text", clip=clip).strip()
            return {
                "text": text,
                "page_width": pdf_page.rect.width,
                "page_height": pdf_page.rect.height,
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract region text: {str(e)}",
            )

    @app.get("/api/temp-image/{filepath:path}")
    async def get_temp_image(filepath: str):
        """获取PDF提取的临时图片"""
        # 验证文件路径安全性（防止路径遍历）
        if ".." in filepath or filepath.startswith("/") or filepath.startswith("\\"):
            raise HTTPException(status_code=400, detail="Invalid filepath")

        # 构建临时文件路径
        temp_dir = Path(tempfile.gettempdir())
        img_path = temp_dir / filepath

        # 确保路径在临时目录内（安全检查）
        try:
            img_path = img_path.resolve()
            if not str(img_path).startswith(str(temp_dir.resolve())):
                raise HTTPException(status_code=400, detail="Invalid filepath")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid filepath")

        if not img_path.exists() or not img_path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")

        # 读取并返回图片
        try:
            return FileResponse(
                img_path,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to read image: {str(e)}"
            )
