from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlparse

import srt  # pyright: ignore[reportMissingImports]
import yt_dlp  # pyright: ignore[reportMissingImports]
from faster_whisper import WhisperModel
from ingest.adapters.base import UrlAdapter
from ingest.models import ScrapeResult
from logger import error, info, warn


def _extract_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host.endswith("youtu.be"):
        video_id = parsed.path.strip("/")
        return video_id or None
    if host.endswith("youtube.com"):
        return parse_qs(parsed.query).get("v", [None])[0]
    return None


def _srt_to_lines(raw_text: str) -> list[str]:
    lines: list[str] = []
    previous: str | None = None
    for subtitle in srt.parse(raw_text):
        line = subtitle.content.replace("\n", " ").strip()
        if not line:
            continue
        if previous == line:
            continue
        lines.append(line)
        previous = line
    return lines


def _find_downloaded_caption(tmpdir: str, video_id: str) -> Path | None:
    tmp_path = Path(tmpdir)
    subtitle_exts = {".srt"}
    candidates = [
        p for p in tmp_path.glob(f"{video_id}*")
        if p.is_file() and p.suffix.lower() in subtitle_exts
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_size)


def _fetch_transcript_lines_from_captions(url: str, video_id: str) -> list[str]:
    with TemporaryDirectory(prefix="yt_captions_") as tmpdir:
        output_template = str(Path(tmpdir) / "%(id)s.%(ext)s")
        with yt_dlp.YoutubeDL(
            {
                "skip_download": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": ["en", "en-US", "en-GB", "en.*"],
                "subtitlesformat": "srt",
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
            }
        ) as ydl:
            ydl.download([url])

        caption_path = _find_downloaded_caption(tmpdir, video_id)
        if caption_path is None:
            return []

        raw_text = caption_path.read_text(encoding="utf-8", errors="replace")
        try:
            lines = _srt_to_lines(raw_text)
        except Exception:
            return []
        if lines:
            return lines
    return []


def _find_downloaded_audio(tmpdir: str, video_id: str) -> Path:
    tmp_path = Path(tmpdir)
    candidates = sorted(tmp_path.glob(f"{video_id}.*"))
    if not candidates:
        candidates = [p for p in tmp_path.iterdir() if p.is_file()]
    if not candidates:
        raise RuntimeError("yt-dlp did not produce an audio file.")
    return max(candidates, key=lambda p: p.stat().st_size)


def _transcribe_via_audio_fallback(url: str, video_id: str) -> list[str]:
    with TemporaryDirectory(prefix="yt_ingest_") as tmpdir:
        output_template = str(Path(tmpdir) / "%(id)s.%(ext)s")
        with yt_dlp.YoutubeDL(
            {
                # Prefer smallest audio-only stream to minimize fallback latency.
                "format": "worstaudio[acodec!=none]/worstaudio/bestaudio/best",
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
            }
        ) as ydl:
            ydl.download([url])

        audio_path = _find_downloaded_audio(tmpdir, video_id)
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), language="en")
        lines = [segment.text.strip() for segment in segments if segment.text and segment.text.strip()]
        if not lines:
            raise RuntimeError("Whisper transcription was empty.")
        return lines


class YouTubeAdapter(UrlAdapter):
    name = "youtube"

    def can_handle(self, url: str) -> bool:
        host = urlparse(url).netloc.lower()
        return host.endswith("youtube.com") or host.endswith("youtu.be")

    def to_markdown(self, url: str) -> ScrapeResult:
        video_id = _extract_video_id(url)
        if not video_id:
            raise ValueError("Could not determine YouTube video id from URL.")
        transcript_lines: list[str] = []
        try:
            transcript_lines = _fetch_transcript_lines_from_captions(url, video_id)
        except Exception:
            transcript_lines = []
        if transcript_lines:
            info(f"[youtube_ingest] yt-dlp captions succeeded video_id={video_id} lines={len(transcript_lines)}")
        if not transcript_lines:
            warn(f"[youtube_ingest] captions unavailable/empty, using audio fallback video_id={video_id}")
            try:
                transcript_lines = _transcribe_via_audio_fallback(url, video_id)
                info(f"[youtube_ingest] audio fallback succeeded video_id={video_id} lines={len(transcript_lines)}")
            except Exception as exc:
                error(f"[youtube_ingest] fallback transcription failed video_id={video_id}: {exc}")
                raise

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
