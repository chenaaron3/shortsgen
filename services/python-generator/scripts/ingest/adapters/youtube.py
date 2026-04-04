from __future__ import annotations

from importlib import import_module
from urllib.parse import parse_qs, urlparse

from ingest.adapters.base import UrlAdapter
from ingest.models import ScrapeResult


def _extract_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host.endswith("youtu.be"):
        video_id = parsed.path.strip("/")
        return video_id or None
    if host.endswith("youtube.com"):
        return parse_qs(parsed.query).get("v", [None])[0]
    return None


def _youtube_api_class():
    """
    Lazy import keeps static analyzers happy when the local Python env
    used by the IDE differs from the pipeline venv.
    """
    try:
        module = import_module("youtube_transcript_api")
        return getattr(module, "YouTubeTranscriptApi")
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency: youtube-transcript-api. Install it in services/python-generator/.venv."
        ) from exc


class YouTubeAdapter(UrlAdapter):
    name = "youtube"

    def can_handle(self, url: str) -> bool:
        host = urlparse(url).netloc.lower()
        return host.endswith("youtube.com") or host.endswith("youtu.be")

    def to_markdown(self, url: str) -> ScrapeResult:
        video_id = _extract_video_id(url)
        if not video_id:
            raise ValueError("Could not determine YouTube video id from URL.")
        youtube_api = _youtube_api_class()

        transcript_lines = None

        try:
            fetched = youtube_api().fetch(video_id, languages=["en"])
            transcript_lines = [getattr(item, "text", "").strip() for item in fetched]
        except Exception:
            transcript_lines = None

        if not transcript_lines:
            fetched = youtube_api.get_transcript(video_id, languages=["en"])
            transcript_lines = [item.get("text", "").strip() for item in fetched]

        transcript_lines = [line for line in transcript_lines if line]
        if not transcript_lines:
            raise RuntimeError("Transcript was empty.")

        body = "\n".join(transcript_lines)
        markdown = "\n".join(
            [
                f"# YouTube Transcript ({video_id})",
                "",
                f"Source: {url}",
                "",
                "## Transcript",
                "",
                body,
            ]
        )

        return ScrapeResult(
            source_url=url,
            adapter_name=self.name,
            markdown=markdown,
            metadata={"video_id": video_id},
        )
