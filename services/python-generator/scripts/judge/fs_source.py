from __future__ import annotations

import re
from typing import Protocol
from urllib.parse import urljoin, urlparse

import requests

DEFAULT_TOPUP_SITE = "https://fs.blog/"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


class ParseLink(Protocol):
    """Convert one HTML page into cleaned markdown text."""

    def parse_from_html(self, source_url: str, html: str) -> str:
        ...


class GetLinks:
    """Find and fetch article sources from fs.blog."""

    def __init__(self, user_agent: str = DEFAULT_USER_AGENT, top_site: str = DEFAULT_TOPUP_SITE):
        self.user_agent = user_agent
        self.top_site = top_site

    def fetch_html(self, url: str) -> str:
        response = requests.get(
            url,
            headers={"User-Agent": self.user_agent},
            timeout=30,
            allow_redirects=True,
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        return response.text

    def discover_article_urls(
        self,
        limit: int,
        exclude: set[str],
        discovery_pages: list[str] | None = None,
    ) -> list[str]:
        pages = [self.top_site]
        if discovery_pages:
            pages.extend(discovery_pages)
        candidates: list[str] = []
        for page_url in pages:
            try:
                html = self.fetch_html(page_url)
            except Exception:
                continue
            found = re.findall(r'href="([^"#?]+)"', html)
            for raw in found:
                url = urljoin(page_url, raw)
                if url not in candidates:
                    candidates.append(url)
        urls: list[str] = []
        for url in candidates:
            if url in exclude:
                continue
            if not self.is_valid_fs_article_url(url):
                continue
            if url not in urls:
                urls.append(url)
            if len(urls) >= limit:
                break
        return urls

    @staticmethod
    def is_valid_fs_article_url(url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False
        if parsed.netloc != "fs.blog":
            return False

        path = parsed.path.strip("/")
        if not path:
            return False

        banned_segments = {
            "wp-json",
            "wp-content",
            "wp-includes",
            "tag",
            "tags",
            "category",
            "categories",
            "about",
            "contact",
            "newsletter",
            "podcast",
            "books",
            "membership",
            "members",
            "sponsor",
            "search",
            "privacy-policy",
            "author",
            "blog",
            "knowledge-project-podcast",
            "articles",
            "all-articles",
            "book-recommendations",
            "episodes",
            "episode",
            "clear",
            "tgmm",
            "mental-models",
            "intellectual-giants",
            "speaking",
        }
        first_segment = path.split("/")[0]
        if first_segment in banned_segments:
            return False

        lowered = path.lower()
        if lowered.endswith(".xml") or lowered.endswith(".json") or "feed" in lowered:
            return False
        if re.search(r"\.(png|jpe?g|webp|gif|svg|pdf|mp3|mp4)$", lowered):
            return False

        parts = [p for p in lowered.split("/") if p]
        if len(parts) == 1:
            slug = parts[0]
            return re.fullmatch(r"[a-z0-9-]{4,}", slug) is not None
        if len(parts) == 3:
            year, month, slug = parts
            return (
                re.fullmatch(r"\d{4}", year) is not None
                and re.fullmatch(r"\d{2}", month) is not None
                and re.fullmatch(r"[a-z0-9-]{4,}", slug) is not None
            )
        return False
