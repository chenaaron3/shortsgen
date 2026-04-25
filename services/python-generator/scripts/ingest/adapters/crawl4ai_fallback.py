from __future__ import annotations

import asyncio
import re

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

from ingest.adapters.base import UrlAdapter
from ingest.models import ScrapeResult


_MD_INLINE_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_MD_AUTOLINK_RE = re.compile(r"<https?://[^>]+>")
_BARE_URL_RE = re.compile(r"(?<!\()https?://[^\s)]+")
_REFERENCE_LINK_DEF_RE = re.compile(r"^\s*\[[^\]]+\]:\s*\S+.*$", re.MULTILINE)


def _strip_links(markdown: str) -> str:
    """Remove URLs from markdown while preserving nearby readable text."""
    out = markdown
    # [label](url) -> label
    out = _MD_INLINE_LINK_RE.sub(r"\1", out)
    # <https://...> -> ""
    out = _MD_AUTOLINK_RE.sub("", out)
    # bare URLs in text -> ""
    out = _BARE_URL_RE.sub("", out)
    # [id]: https://... reference definitions -> remove full line
    out = _REFERENCE_LINK_DEF_RE.sub("", out)
    return out


def _extract_markdown(markdown_obj: object) -> str:
    if isinstance(markdown_obj, str):
        return markdown_obj.strip()

    fit_markdown = getattr(markdown_obj, "fit_markdown", None)
    if isinstance(fit_markdown, str) and fit_markdown.strip():
        return fit_markdown.strip()

    raw_markdown = getattr(markdown_obj, "raw_markdown", None)
    if isinstance(raw_markdown, str) and raw_markdown.strip():
        return raw_markdown.strip()

    markdown = getattr(markdown_obj, "markdown", None)
    if isinstance(markdown, str) and markdown.strip():
        return markdown.strip()

    return _strip_links(str(markdown_obj).strip())


async def _crawl(url: str) -> str:
    content_filter = PruningContentFilter(
        threshold=0.45,
        threshold_type="dynamic",
        min_word_threshold=40,
    )
    markdown_generator = DefaultMarkdownGenerator(content_filter=content_filter)
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        markdown_generator=markdown_generator,
    )
    browser_config = BrowserConfig(headless=True, verbose=False)
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)
    if not getattr(result, "success", False):
        message = getattr(result, "error_message", "Unknown crawl error")
        raise RuntimeError(message)
    markdown = _extract_markdown(getattr(result, "markdown", ""))
    if not markdown:
        raise RuntimeError("Crawl succeeded but markdown output was empty.")
    return _strip_links(markdown)

class Crawl4AiFallbackAdapter(UrlAdapter):
    name = "crawl4ai-fallback"

    def can_handle(self, url: str) -> bool:
        return True

    def to_markdown(self, url: str) -> ScrapeResult:
        markdown = asyncio.run(_crawl(url))
        return ScrapeResult(
            source_url=url,
            adapter_name=self.name,
            markdown=markdown,
            metadata={},
        )
