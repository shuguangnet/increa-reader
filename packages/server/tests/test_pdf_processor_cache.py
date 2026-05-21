import os
from pathlib import Path

import increa_reader.pdf_processor as pdf_processor


class DummyDoc:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_extract_page_markdown_uses_cache(monkeypatch, tmp_path):
    pdf_processor._extract_page_markdown_cached.cache_clear()

    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%mock\n")

    markdown_calls = {"count": 0}

    def fake_fitz_open(path):
        assert os.fspath(path) == os.fspath(pdf_path)
        return DummyDoc()

    def fake_to_markdown(doc, *, pages, write_images, image_path, image_format):
        assert isinstance(doc, DummyDoc)
        assert pages == [0]
        assert write_images is True
        assert image_format == "png"
        markdown_calls["count"] += 1
        return f"![img]({image_path}/figure.png)\n\nhello world"

    monkeypatch.setattr(pdf_processor.fitz, "open", fake_fitz_open)
    monkeypatch.setattr(pdf_processor.pymupdf4llm, "to_markdown", fake_to_markdown)

    first = pdf_processor.extract_page_markdown(pdf_path, 1)
    second = pdf_processor.extract_page_markdown(pdf_path, 1)

    assert markdown_calls["count"] == 1
    assert first == second
    assert "/api/temp-image/pymupdf4llm_images/figure.png" in first["markdown"]
    assert first["has_images"] is True


def test_render_page_svg_uses_cache(monkeypatch, tmp_path):
    pdf_processor._render_page_svg_cached.cache_clear()

    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%mock\n")

    render_calls = {"count": 0}

    class DummyProcessor:
        def __init__(self, doc_path):
            assert Path(doc_path) == pdf_path

        def render_page_svg(self, page_num):
            render_calls["count"] += 1
            return f"<svg data-page='{page_num}' />"

        def close(self):
            return None

    monkeypatch.setattr(pdf_processor, "PDFPageProcessor", DummyProcessor)

    first = pdf_processor.render_page_svg(pdf_path, 2)
    second = pdf_processor.render_page_svg(pdf_path, 2)

    assert render_calls["count"] == 1
    assert first == second == "<svg data-page='2' />"
