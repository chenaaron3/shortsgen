from __future__ import annotations

from ingest.adapters.base import UrlAdapter
from ingest.adapters.crawl4ai_fallback import Crawl4AiFallbackAdapter
from ingest.adapters.reddit import RedditAdapter
from ingest.adapters.youtube import YouTubeAdapter


def adapter_registry() -> list[UrlAdapter]:
    return [
        YouTubeAdapter(),
        RedditAdapter(),
        Crawl4AiFallbackAdapter(),
    ]


def resolve_adapter(url: str) -> UrlAdapter:
    for adapter in adapter_registry():
        if adapter.can_handle(url):
            return adapter
    return Crawl4AiFallbackAdapter()
