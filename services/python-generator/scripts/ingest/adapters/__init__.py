from ingest.adapters.base import UrlAdapter
from ingest.adapters.crawl4ai_fallback import Crawl4AiFallbackAdapter
from ingest.adapters.reddit import RedditAdapter
from ingest.adapters.youtube import YouTubeAdapter

__all__ = ["UrlAdapter", "YouTubeAdapter", "RedditAdapter", "Crawl4AiFallbackAdapter"]
