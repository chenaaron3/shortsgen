from __future__ import annotations

from urllib.parse import urlparse

import requests

from ingest.adapters.base import UrlAdapter
from ingest.models import ScrapeResult

USER_AGENT = "shortgen-pipeline/1.0 (+https://github.com/)"


def _json_url(url: str) -> str:
    trimmed = url.rstrip("/")
    if trimmed.endswith(".json"):
        return trimmed
    return f"{trimmed}.json"


class RedditAdapter(UrlAdapter):
    name = "reddit"

    def can_handle(self, url: str) -> bool:
        return urlparse(url).netloc.lower().endswith("reddit.com")

    def to_markdown(self, url: str) -> ScrapeResult:
        resp = requests.get(
            _json_url(url),
            headers={"User-Agent": USER_AGENT},
            timeout=30,
        )
        resp.raise_for_status()
        payload = resp.json()

        if not isinstance(payload, list) or len(payload) < 2:
            raise RuntimeError("Unexpected Reddit JSON payload.")

        post_listing = payload[0].get("data", {}).get("children", [])
        comments_listing = payload[1].get("data", {}).get("children", [])
        if not post_listing:
            raise RuntimeError("No Reddit post found in payload.")

        post = post_listing[0].get("data", {})
        title = post.get("title", "").strip()
        author = post.get("author", "").strip()
        subreddit = post.get("subreddit", "").strip()
        selftext = post.get("selftext", "").strip()

        lines = [
            f"# {title or 'Reddit Post'}",
            "",
            f"Source: {url}",
            "",
            f"- Subreddit: r/{subreddit}" if subreddit else "- Subreddit: unknown",
            f"- Author: u/{author}" if author else "- Author: unknown",
            "",
            "## Post",
            "",
            selftext or "_No post body text_",
            "",
            "## Top-level comments",
            "",
        ]

        top_level_count = 0
        for item in comments_listing:
            data = item.get("data", {})
            body = data.get("body", "").strip()
            if not body:
                continue
            commenter = data.get("author", "unknown")
            score = data.get("score", 0)
            lines.extend([f"### u/{commenter} (score: {score})", "", body, ""])
            top_level_count += 1

        if top_level_count == 0:
            lines.append("_No top-level comments found_")

        return ScrapeResult(
            source_url=url,
            adapter_name=self.name,
            markdown="\n".join(lines).strip(),
            metadata={"top_level_comments": str(top_level_count)},
        )
