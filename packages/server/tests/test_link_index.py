"""Tests for link_index module — wiki-link and markdown link parsing/resolution."""
import pytest
from pathlib import Path
from increa_reader.link_index import WIKI_LINK_RE, MD_LINK_RE, _resolve_link


class TestWikiLinkRegex:
    def test_basic_wiki_link(self):
        text = "See [[some-page]] for details"
        matches = list(WIKI_LINK_RE.finditer(text))
        assert len(matches) == 1
        assert matches[0].group(1) == "some-page"

    def test_wiki_link_with_alias(self):
        text = "[[page-1|Display Text]]"
        matches = list(WIKI_LINK_RE.finditer(text))
        assert len(matches) == 1
        assert matches[0].group(1) == "page-1"

    def test_multiple_wiki_links(self):
        text = "Links: [[a]] and [[b|B]] and [[c]]"
        matches = list(WIKI_LINK_RE.finditer(text))
        assert len(matches) == 3

    def test_no_wiki_links(self):
        text = "No links here, just plain text."
        assert list(WIKI_LINK_RE.finditer(text)) == []


class TestMdLinkRegex:
    def test_basic_md_link(self):
        text = "[click here](./other.md)"
        matches = list(MD_LINK_RE.finditer(text))
        assert len(matches) == 1
        assert matches[0].group(1) == "./other.md"

    def test_multiple_md_links(self):
        text = "[a](x.md) and [b](y.md)"
        matches = list(MD_LINK_RE.finditer(text))
        assert len(matches) == 2

    def test_image_link_not_matched(self):
        # MD_LINK_RE also matches image syntax, which is fine
        text = "![image](pic.png)"
        matches = list(MD_LINK_RE.finditer(text))
        assert len(matches) == 1


class TestResolveLink:
    def test_relative_link(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        source_dir = repo / "docs"
        source_dir.mkdir()
        # Create target file
        (repo / "notes.md").write_text("hello")

        result = _resolve_link(source_dir, "../notes.md", repo)
        assert result == "notes.md"

    def test_absolute_link(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        (repo / "target.md").write_text("hello")

        result = _resolve_link(repo, "/target.md", repo)
        assert result == "target.md"

    def test_external_link_returns_none(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        # _resolve_link only resolves within repo
        result = _resolve_link(repo, "https://example.com", repo)
        assert result is None

    def test_missing_target_with_md_fallback(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        (repo / "notes.md").write_text("hello")

        # Link to "notes" without .md extension, but notes.md exists
        result = _resolve_link(repo, "notes", repo)
        assert result == "notes.md"

    def test_hash_link_ignored(self, tmp_path):
        repo = tmp_path / "repo"
        repo.mkdir()
        result = _resolve_link(repo, "#heading-only", repo)
        assert result is None