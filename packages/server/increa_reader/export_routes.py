"""
Export and import API routes
"""

import io
import re
import tempfile
import zipfile
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse

import aiofiles
import httpx
from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .models import WorkspaceConfig
from .workspace import is_text_file

# ---------- Pydantic models ----------

class ConvertRequest(BaseModel):
    repo: str
    path: str
    format: str  # "html" | "pdf" | "plain"


class BatchRequest(BaseModel):
    repo: str
    paths: List[str]
    format: str  # "html" | "pdf" | "plain"


class ZipRequest(BaseModel):
    repo: str
    directory: str
    format: str  # "markdown" | "html"


class ImportUrlRequest(BaseModel):
    repo: str
    target_path: str
    url: str


# ---------- Markdown conversion helpers ----------

def _md_to_html(md_text: str) -> str:
    """Simple Markdown-to-HTML conversion using regex (no external library)."""
    text = md_text

    # Escape HTML entities (but keep tags we generate)
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")

    # Code blocks (fenced) — must be before other rules
    text = re.sub(
        r"```(\w*)\n(.*?)```",
        lambda m: f'<pre><code class="language-{m.group(1)}">{m.group(2)}</code></pre>',
        text,
        flags=re.DOTALL,
    )

    # Inline code
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)

    # Headers
    for i in range(6, 0, -1):
        pattern = r"^" + "#" * i + r"\s+(.+)$"
        text = re.sub(pattern, rf"<h{i}>\1</h{i}>", text, flags=re.MULTILINE)

    # Bold + Italic
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)

    # Links and images
    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img src="\2" alt="\1">', text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)

    # Unordered lists (simple: consecutive lines starting with - )
    text = re.sub(
        r"((?:^- .+\n?)+)",
        lambda m: "<ul>\n"
        + "".join(f"<li>{line[2:]}</li>\n" for line in m.group(1).strip().split("\n"))
        + "</ul>\n",
        text,
        flags=re.MULTILINE,
    )

    # Horizontal rule
    text = re.sub(r"^---+$", "<hr>", text, flags=re.MULTILINE)

    # Paragraphs: wrap remaining loose lines
    lines = text.split("\n")
    result_lines = []
    in_block = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("<") or stripped == "":
            if in_block and stripped == "":
                result_lines.append("</p>")
                in_block = False
            result_lines.append(line)
        else:
            if not in_block:
                result_lines.append("<p>")
                in_block = True
            result_lines.append(line)
    if in_block:
        result_lines.append("</p>")

    html = "\n".join(result_lines)
    return html


def _md_to_plain(md_text: str) -> str:
    """Strip Markdown formatting to produce plain text."""
    text = md_text
    # Remove code blocks
    text = re.sub(r"```[\s\S]*?```", lambda m: m.group(0).strip("`").strip(), text)
    # Remove inline code markers
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove headers markers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"\1", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    # Remove links, keep text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove images, keep alt text
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    # Remove horizontal rules
    text = re.sub(r"^---+$", "", text, flags=re.MULTILINE)
    # Remove list markers
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    return text.strip()


def _md_to_pdf_bytes(md_text: str) -> bytes:
    """Convert Markdown text to PDF using PyMuPDF (fitz)."""
    import fitz

    plain = _md_to_plain(md_text)
    doc = fitz.open()
    page = doc.new_page()
    # Use a simple text insertion
    text_rect = page.rect
    font = fitz.Font("helv")
    fontsize = 11
    line_height = fontsize * 1.4

    lines = plain.split("\n")
    y = 50
    margin_left = 50
    max_width = text_rect.width - 2 * margin_left

    for line in lines:
        # Wrap long lines
        words = line.split(" ")
        current_line = ""
        for word in words:
            test = f"{current_line} {word}".strip()
            if font.text_length(test, fontsize=fontsize) > max_width:
                if current_line:
                    page.insert_text(
                        (margin_left, y),
                        current_line,
                        fontname="helv",
                        fontsize=fontsize,
                    )
                    y += line_height
                current_line = word
            else:
                current_line = test
        if current_line:
            page.insert_text(
                (margin_left, y), current_line, fontname="helv", fontsize=fontsize
            )
            y += line_height

        if y > text_rect.height - 50:
            page = doc.new_page()
            y = 50

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# ---------- Repo helper ----------

def _find_repo(workspace_config: WorkspaceConfig, repo: str):
    repo_config = next((r for r in workspace_config.repos if r.name == repo), None)
    if not repo_config:
        raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
    return repo_config


def _resolve_path(repo_config, path: str) -> Path:
    """Resolve path within repo, with security check."""
    file_path = (Path(repo_config.root) / path).resolve()
    repo_root = Path(repo_config.root).resolve()
    if not str(file_path).startswith(str(repo_root)):
        raise HTTPException(status_code=403, detail="Access denied: path outside repo")
    return file_path


# ---------- Extension mapping ----------

FORMAT_TO_EXT = {"html": ".html", "pdf": ".pdf", "plain": ".txt"}


# ---------- Route factory ----------

def create_export_routes(app, workspace_config: WorkspaceConfig):
    """Create export and import API routes"""

    # 1. Export single file
    @app.post("/api/export/convert")
    async def export_convert(body: ConvertRequest):
        repo_config = _find_repo(workspace_config, body.repo)
        file_path = _resolve_path(repo_config, body.path)

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = await f.read()

        fmt = body.format.lower()
        if fmt not in ("html", "pdf", "plain"):
            raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

        stem = Path(body.path).stem
        ext = FORMAT_TO_EXT[fmt]
        filename = f"{stem}{ext}"

        if fmt == "html":
            converted = _md_to_html(content)
            return {"content": converted, "format": "html", "filename": filename}
        elif fmt == "plain":
            converted = _md_to_plain(content)
            return {"content": converted, "format": "plain", "filename": filename}
        else:  # pdf
            pdf_bytes = _md_to_pdf_bytes(content)
            # Save to temp file and return path info
            tmp = tempfile.NamedTemporaryFile(
                suffix=".pdf", prefix=f"{stem}_", delete=False
            )
            tmp.write(pdf_bytes)
            tmp.close()
            return {
                "content": "",
                "format": "pdf",
                "filename": filename,
                "temp_path": tmp.name,
                "size": len(pdf_bytes),
            }

    # Download PDF helper endpoint
    @app.get("/api/export/pdf-download")
    async def pdf_download(temp_path: str):
        """Download a generated PDF from its temp path."""
        p = Path(temp_path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="PDF file not found")
        from fastapi.responses import FileResponse

        return FileResponse(
            p, media_type="application/pdf", filename=p.name
        )

    # 2. Batch export
    @app.post("/api/export/batch")
    async def export_batch(body: BatchRequest):
        repo_config = _find_repo(workspace_config, body.repo)
        fmt = body.format.lower()
        if fmt not in ("html", "pdf", "plain"):
            raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

        results = []
        for rel_path in body.paths:
            file_path = _resolve_path(repo_config, rel_path)
            if not file_path.exists() or not file_path.is_file():
                results.append({"path": rel_path, "error": "File not found"})
                continue

            async with aiofiles.open(
                file_path, "r", encoding="utf-8", errors="replace"
            ) as f:
                content = await f.read()

            stem = Path(rel_path).stem
            ext = FORMAT_TO_EXT[fmt]
            filename = f"{stem}{ext}"

            if fmt == "html":
                converted = _md_to_html(content)
            elif fmt == "plain":
                converted = _md_to_plain(content)
            else:  # pdf
                converted = f"[PDF generated: {filename}]"

            results.append(
                {"path": rel_path, "content": converted, "filename": filename}
            )

        return {"results": results}

    # 3. Directory ZIP export
    @app.post("/api/export/zip")
    async def export_zip(body: ZipRequest):
        repo_config = _find_repo(workspace_config, body.repo)
        fmt = body.format.lower()
        if fmt not in ("markdown", "html"):
            raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

        dir_path = _resolve_path(repo_config, body.directory)
        if not dir_path.exists() or not dir_path.is_dir():
            raise HTTPException(status_code=404, detail="Directory not found")

        # Collect text files
        text_extensions = {
            ".md", ".markdown", ".txt", ".json", ".yaml", ".yml",
            ".toml", ".ini", ".cfg", ".conf", ".html", ".htm",
            ".css", ".js", ".ts", ".py", ".sh", ".bash",
        }
        files_to_zip = []
        for fp in sorted(dir_path.rglob("*")):
            if not fp.is_file():
                continue
            # Skip binary files heuristically
            if fp.suffix.lower() not in text_extensions:
                # Use is_text_file for unknown extensions
                try:
                    raw = fp.read_bytes()[:4096]
                    if not is_text_file(raw):
                        continue
                except Exception:
                    continue
            files_to_zip.append(fp)

        # Build ZIP in memory
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fp in files_to_zip:
                rel = str(fp.relative_to(dir_path))
                if fmt == "html" and fp.suffix.lower() in (".md", ".markdown"):
                    content = fp.read_text(encoding="utf-8", errors="replace")
                    html_content = _md_to_html(content)
                    zip_name = str(Path(rel).with_suffix(".html"))
                    zf.writestr(zip_name, html_content)
                else:
                    zf.write(fp, arcname=rel)

        buf.seek(0)
        zip_filename = f"{Path(body.directory).rstrip('/').replace('/', '_') or 'export'}.zip"

        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
        )

    # 4. Import file upload
    @app.post("/api/import/upload")
    async def import_upload(
        repo: str = Form(...),
        target_path: str = Form(""),
        files: List[UploadFile] = File(...),
    ):
        repo_config = _find_repo(workspace_config, repo)
        target_dir = _resolve_path(repo_config, target_path) if target_path else Path(repo_config.root).resolve()
        target_dir.mkdir(parents=True, exist_ok=True)

        allowed_extensions = {
            ".md", ".txt", ".pdf", ".html", ".json", ".yaml", ".yml",
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp",
            ".csv", ".tsv", ".toml", ".ini", ".cfg", ".conf",
        }

        imported = []
        for upload in files:
            ext = Path(upload.filename or "unknown").suffix.lower()
            if ext not in allowed_extensions:
                imported.append({
                    "path": upload.filename or "unknown",
                    "error": f"File type '{ext}' not allowed",
                })
                continue

            dest = target_dir / (upload.filename or "unnamed")
            # Avoid overwrite: add number suffix if needed
            if dest.exists():
                stem = dest.stem
                i = 1
                while dest.exists():
                    dest = target_dir / f"{stem}_{i}{dest.suffix}"
                    i += 1

            content = await upload.read()
            async with aiofiles.open(dest, "wb") as f:
                await f.write(content)

            rel_path = str(dest.relative_to(Path(repo_config.root).resolve()))
            imported.append({"path": rel_path, "size": len(content)})

        return {"imported": imported}

    # 5. Import from URL
    @app.post("/api/import/url")
    async def import_url(body: ImportUrlRequest):
        repo_config = _find_repo(workspace_config, body.repo)
        target_dir = _resolve_path(repo_config, body.target_path)
        target_dir.mkdir(parents=True, exist_ok=True)

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                resp = await client.get(body.url)
                resp.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"Failed to download URL: {e}")

        content_type = resp.headers.get("content-type", "")
        url_path = urlparse(body.url).path
        filename = Path(url_path).name or "downloaded"

        is_html = "text/html" in content_type or filename.endswith((".html", ".htm"))
        raw_bytes = resp.content

        if is_html:
            # Convert HTML to Markdown (simple extraction)
            html_text = raw_bytes.decode("utf-8", errors="replace")
            # Strip tags to get plain text, save as .md
            plain = re.sub(r"<script[\s\S]*?</script>", "", html_text, flags=re.IGNORECASE)
            plain = re.sub(r"<style[\s\S]*?</style>", "", plain, flags=re.IGNORECASE)
            plain = re.sub(r"<[^>]+>", "", plain)
            plain = re.sub(r"\n{3,}", "\n\n", plain.strip())
            filename = Path(filename).stem + ".md"
            save_content = plain.encode("utf-8")
        else:
            # Save as-is
            save_content = raw_bytes

        dest = target_dir / filename
        if dest.exists():
            stem = dest.stem
            i = 1
            while dest.exists():
                dest = target_dir / f"{stem}_{i}{dest.suffix}"
                i += 1

        async with aiofiles.open(dest, "wb") as f:
            await f.write(save_content)

        rel_path = str(dest.relative_to(Path(repo_config.root).resolve()))
        return {"path": rel_path, "size": len(save_content)}