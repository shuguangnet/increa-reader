"""PDF页面处理：提取文本、图片、表格和数学公式，转换为Markdown。"""

import os
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import fitz  # PyMuPDF
import pymupdf4llm


class PDFPageProcessor:
    """PDF页面处理器"""

    def __init__(self, doc_path: str):
        self.doc = fitz.open(doc_path)
        self.temp_dir = Path(tempfile.gettempdir())

    def close(self):
        """关闭文档"""
        if self.doc:
            self.doc.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _extract_page_content(self, page_num: int) -> Dict[str, Any]:
        """提取页面内容"""
        if page_num < 1 or page_num > self.doc.page_count:
            raise ValueError(f"Page {page_num} out of range (1-{self.doc.page_count})")

        page = self.doc[page_num - 1]

        # 获取页面尺寸
        rect = page.rect

        # 提取文本块
        text_blocks = page.get_text("dict")

        # 1. 检测表格
        tables = self._extract_tables(page)
        table_regions = [table["bbox"] for table in tables]

        # 2. 检测图片
        images = self._extract_images(page, page_num)

        # 3. 处理文本块，排除表格和图片区域
        text_content = self._process_text_blocks(text_blocks, table_regions, rect)

        # 4. 组合所有内容
        markdown_content = self._assemble_markdown(
            text_content, tables, images, page_num
        )

        return {
            "page": page_num,
            "markdown": markdown_content,
            "has_tables": len(tables) > 0,
            "has_images": len(images) > 0,
            "estimated_reading_time": len(markdown_content.split()) // 200,
        }

    def _extract_tables(self, page) -> List[Dict[str, Any]]:
        """提取表格"""
        tables = []

        try:
            table_finder = page.find_tables()

            for table_idx, table in enumerate(table_finder.tables):
                table_data = table.extract()
                markdown_table = self._convert_table_to_markdown(table_data)

                tables.append(
                    {
                        "id": f"table_{table_idx + 1}",
                        "bbox": table.bbox,
                        "markdown": markdown_table,
                        "rows": len(table_data),
                        "cols": len(table_data[0]) if table_data else 0,
                    }
                )

        except Exception:
            # 表格检测失败时静默降级为空结果
            pass

        return tables

    def _convert_table_to_markdown(self, table_data: List[List[str]]) -> str:
        """将表格数据转换为Markdown格式"""
        if not table_data:
            return ""

        processed_data = []
        max_cols = max(len(row) for row in table_data)

        for row in table_data:
            processed_row = row + [""] * (max_cols - len(row))
            processed_data.append([cell.strip() for cell in processed_row])

        markdown_lines = []

        if processed_data:
            header = "| " + " | ".join(processed_data[0]) + " |"
            markdown_lines.append(header)

            separator = "|" + "|".join([" --- " for _ in processed_data[0]]) + "|"
            markdown_lines.append(separator)

            for row in processed_data[1:]:
                data_row = "| " + " | ".join(row) + " |"
                markdown_lines.append(data_row)

        return "\n".join(markdown_lines)

    def _extract_images(self, page, page_num: int) -> List[Dict[str, Any]]:
        """提取图片"""
        images = []

        try:
            image_list = page.get_images()

            for img_idx, img in enumerate(image_list):
                xref = img[0]
                pix = fitz.Pixmap(self.doc, xref)

                if pix.n - pix.alpha < 4:
                    img_filename = f"pdf_p{page_num}_img{img_idx + 1}.png"
                    img_path = self.temp_dir / img_filename
                    pix.save(img_path)

                    img_rect = page.get_image_bbox(img)

                    images.append(
                        {
                            "id": f"image_{img_idx + 1}",
                            "path": str(img_path),
                            "bbox": img_rect,
                            "width": pix.width,
                            "height": pix.height,
                            "markdown": f"![图片{img_idx + 1}](/api/temp-image/{img_filename})",
                        }
                    )

                pix = None

        except Exception:
            return images

        return images

    def _process_text_blocks(
        self, text_blocks: Dict, table_regions: List, page_rect
    ) -> List[Dict[str, Any]]:
        """处理文本块，识别段落、标题、公式"""
        content = []

        if "blocks" not in text_blocks:
            return content

        blocks = sorted(text_blocks["blocks"], key=lambda b: b["bbox"][1])

        for block in blocks:
            if block["type"] != 0:
                continue

            block_rect = fitz.Rect(block["bbox"])
            in_table = any(
                block_rect.intersects(table_region) for table_region in table_regions
            )

            if in_table:
                continue

            block_text = ""
            if "lines" in block:
                for line in block["lines"]:
                    if "spans" in line:
                        line_text = ""
                        for span in line["spans"]:
                            line_text += span["text"]
                        block_text += line_text + "\n"

            block_text = block_text.strip()
            if not block_text:
                continue

            text_type = self._classify_text(block_text, block)

            content.append(
                {
                    "type": text_type,
                    "text": block_text,
                    "bbox": block["bbox"],
                    "font_info": self._get_font_info(block),
                }
            )

        return content

    def _classify_text(self, text: str, block: Dict) -> str:
        """分类文本类型：标题、段落、公式等"""
        if self._is_math_formula(text):
            return "formula"

        font_info = self._get_font_info(block)
        if font_info and font_info.get("size", 12) > 14:
            if text.strip().endswith(":") or len(text.strip()) < 100:
                return "heading"

        if re.match(r"^\s*[-•*]\s+", text) or re.match(r"^\s*\d+\.\s+", text):
            return "list"

        return "paragraph"

    def _is_math_formula(self, text: str) -> bool:
        """检测是否为数学公式"""
        math_indicators = [
            r"\\frac\{",
            r"\\sqrt\{",
            r"\\sum\{",
            r"\\int\{",
            r"\{.*\}_\{.*\}",
            r"\{.*\}\^\{.*\}",
            r"\\alpha",
            r"\\beta",
            r"\\gamma",
            r"\\delta",
            r"\\theta",
            r"\\lambda",
            r"\\mu",
            r"\\pi",
            r"\\sigma",
            r"\\phi",
            r"\\omega",
            r"\\leq",
            r"\\geq",
            r"\\neq",
            r"\\approx",
            r"\\infty",
            r"\$.*\$",
        ]

        for pattern in math_indicators:
            if re.search(pattern, text):
                return True

        math_chars = set("∑∏∫√±≤≥≠∞∂∇∆αβγδεζηθικλμνξοπρστυφχψω")
        ratio = sum(1 for c in text if c in math_chars) / len(text) if text else 0

        return ratio > 0.2 and len(text.strip()) < 200

    def _get_font_info(self, block: Dict) -> Dict[str, Any]:
        """获取字体信息"""
        if "lines" not in block or not block["lines"]:
            return {}

        first_line = block["lines"][0]
        if "spans" not in first_line or not first_line["spans"]:
            return {}

        first_span = first_line["spans"][0]
        return {
            "size": first_span.get("size", 12),
            "flags": first_span.get("flags", 0),
            "font": first_span.get("font", ""),
        }

    def _assemble_markdown(
        self,
        text_content: List[Dict],
        tables: List[Dict],
        images: List[Dict],
        page_num: int,
    ) -> str:
        """组装最终的Markdown内容"""
        markdown_parts = []
        all_content = []

        for idx, item in enumerate(text_content):
            all_content.append(
                {
                    "type": "text",
                    "subtype": item["type"],
                    "content": item,
                    "bbox": item["bbox"],
                    "order": idx,
                }
            )

        for idx, table in enumerate(tables):
            all_content.append(
                {"type": "table", "content": table, "bbox": table["bbox"], "order": idx}
            )

        for idx, image in enumerate(images):
            all_content.append(
                {"type": "image", "content": image, "bbox": image["bbox"], "order": idx}
            )

        all_content.sort(key=lambda x: x["bbox"][1])

        for item in all_content:
            if item["type"] == "text":
                markdown_parts.append(self._format_text_content(item["content"]))
            elif item["type"] == "table":
                markdown_parts.append(f"\n{item['content']['markdown']}\n")
            elif item["type"] == "image":
                markdown_parts.append(f"\n{item['content']['markdown']}\n")

        result = "\n".join(markdown_parts)
        if result.strip():
            result += f"\n\n---\n\n*第 {page_num} 页*\n"

        return result

    def _format_text_content(self, text_item: Dict) -> str:
        """格式化文本内容为Markdown"""
        text = text_item["text"]
        text_type = text_item["type"]

        if text_type == "heading":
            font_size = text_item.get("font_info", {}).get("size", 12)
            if font_size > 18:
                level = 1
            elif font_size > 16:
                level = 2
            elif font_size > 14:
                level = 3
            else:
                level = 4

            return f"\n{'#' * level} {text.strip()}\n"

        if text_type == "formula":
            if "$" in text:
                return f"\n$$\n{text}\n$$\n"
            return f"\n`{text}`\n"

        if text_type == "list":
            return f"\n{text}\n"

        return f"\n{text}\n"

    def render_page_svg(self, page_num: int) -> str:
        """渲染页面为SVG矢量图"""
        if page_num < 1 or page_num > self.doc.page_count:
            raise ValueError(f"Page {page_num} out of range (1-{self.doc.page_count})")

        page = self.doc[page_num - 1]
        return page.get_svg_image()


def _get_file_signature(doc_path: str) -> tuple[int, int]:
    stat = os.stat(doc_path)
    return (stat.st_mtime_ns, stat.st_size)


def _rewrite_temp_image_paths(markdown: str, image_dir: Path) -> str:
    image_dir_str = str(image_dir)
    return re.sub(
        r"!\[(.*?)\]\(" + re.escape(image_dir_str) + r"/([^)]+)\)",
        r"![\1](/api/temp-image/pymupdf4llm_images/\2)",
        markdown,
    )


@lru_cache(maxsize=128)
def _extract_page_markdown_cached(
    doc_path: str,
    file_signature: tuple[int, int],
    page_num: int,
) -> Dict[str, Any]:
    del file_signature

    with fitz.open(doc_path) as doc:
        img_dir = Path(tempfile.gettempdir()) / "pymupdf4llm_images"
        img_dir.mkdir(exist_ok=True)

        md_text = pymupdf4llm.to_markdown(
            doc,
            pages=[page_num - 1],
            write_images=True,
            image_path=str(img_dir),
            image_format="png",
        )

    md_text = _rewrite_temp_image_paths(md_text, img_dir)
    has_tables = "|" in md_text and "---" in md_text
    has_images = "![" in md_text

    return {
        "page": page_num,
        "markdown": md_text,
        "has_tables": has_tables,
        "has_images": has_images,
        "estimated_reading_time": len(md_text.split()) // 200,
    }


@lru_cache(maxsize=256)
def _render_page_svg_cached(
    doc_path: str,
    file_signature: tuple[int, int],
    page_num: int,
) -> str:
    del file_signature

    processor = PDFPageProcessor(doc_path)
    try:
        return processor.render_page_svg(page_num)
    finally:
        processor.close()


def extract_page_markdown(doc_path: str, page_num: int) -> Dict[str, Any]:
    """
    提取PDF页面的Markdown内容（使用 pymupdf4llm）

    Args:
        doc_path: PDF文件路径
        page_num: 页码（1-based）

    Returns:
        Dict containing markdown content and metadata
    """
    return _extract_page_markdown_cached(doc_path, _get_file_signature(doc_path), page_num)


def render_page_svg(doc_path: str, page_num: int) -> str:
    """
    渲染PDF页面为SVG矢量图

    Args:
        doc_path: PDF文件路径
        page_num: 页码（1-based）

    Returns:
        SVG content as string
    """
    return _render_page_svg_cached(doc_path, _get_file_signature(doc_path), page_num)
