#!/usr/bin/env python3
"""
Ingest channels from channels.txt: fetch metadata, download transcripts, output JSON.

Reads channel URLs from channels.txt, extracts channel details + video list (cached),
downloads transcripts (cached by file existence), and writes a JSON index.

Output JSON structure:
  { "ChannelHandle": { channel details, subscribers, videos: [{ id, title, link, view_count, transcript }] } }

Usage:
  python scraper/ingest_channels.py [--channels-file channels.txt] [--output data.json]
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yt_dlp

# Import shared helpers from download script
from download_shorts_transcripts import (
    download_channel_shorts_transcripts,
    get_shorts_url,
    is_channel_url,
)

DEFAULT_CHANNELS_FILE = "channels.txt"
DEFAULT_OUTPUT_JSON = "data.json"
DEFAULT_CACHE_DIR = ".cache"
CACHE_MAX_AGE_HOURS = 24


def get_channel_key_from_url(url: str) -> str:
    """Extract a stable key (handle or channel ID) from URL for caching and JSON keys."""
    url = url.strip().rstrip("/")
    if "/@" in url:
        handle = url.split("/@")[-1].split("/")[0].split("?")[0]
        return handle or "unknown"
    if "/channel/" in url:
        return url.split("/channel/")[-1].split("/")[0].split("?")[0] or "unknown"
    if "/c/" in url:
        return url.split("/c/")[-1].split("/")[0].split("?")[0].replace(" ", "_") or "unknown"
    if "/user/" in url:
        return url.split("/user/")[-1].split("/")[0].split("?")[0] or "unknown"
    return "unknown"


def cache_key_for_url(url: str) -> str:
    """Stable cache key for a channel URL."""
    return hashlib.sha256(url.strip().encode()).hexdigest()[:16]


def load_cached_metadata(cache_dir: Path, url: str, max_age_hours: float) -> Optional[dict]:
    """Load cached channel + videos metadata if valid."""
    key = cache_key_for_url(url)
    cache_file = cache_dir / "metadata" / f"{key}.json"
    if not cache_file.exists():
        return None
    try:
        data = json.loads(cache_file.read_text())
        cached_at = data.get("_cached_at")
        if cached_at:
            dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
            if age_hours > max_age_hours:
                return None
        return data
    except (json.JSONDecodeError, OSError):
        return None


def save_cached_metadata(cache_dir: Path, url: str, data: dict) -> None:
    """Save channel + videos metadata to cache."""
    cache_dir = cache_dir / "metadata"
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = cache_key_for_url(url)
    cache_file = cache_dir / f"{key}.json"
    out = {**data, "_cached_at": datetime.now(timezone.utc).isoformat()}
    cache_file.write_text(json.dumps(out, indent=2))


def extract_channel_and_videos(shorts_url: str, cache_dir: Path, max_age_hours: float) -> dict:
    """
    Extract channel metadata and video list from Shorts tab.
    Uses cache if valid; otherwise fetches via yt-dlp.
    """
    cached = load_cached_metadata(cache_dir, shorts_url, max_age_hours)
    if cached is not None:
        print("   📦 Using cached metadata")
        return cached

    print("   📡 Fetching metadata from YouTube...")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "ignoreerrors": True,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(shorts_url, download=False)
        if not info:
            raise ValueError(f"Could not extract info for {shorts_url}")

    channel_id = info.get("channel_id") or info.get("channel") or ""
    channel = info.get("channel") or info.get("uploader") or ""
    channel_url = info.get("channel_url") or f"https://www.youtube.com/channel/{channel_id}"
    subscriber_count = info.get("channel_follower_count") or info.get("channel_subscriber_count") or 0

    entries = info.get("entries") or []
    videos = []
    for e in entries:
        if not e:
            continue
        vid = e.get("id")
        if not vid:
            continue
        videos.append({
            "id": vid,
            "title": e.get("title") or "(no title)",
            "link": e.get("url") or e.get("webpage_url") or f"https://www.youtube.com/shorts/{vid}",
            "view_count": e.get("view_count") or 0,
        })
    skipped = len(entries) - len(videos)
    if skipped > 0:
        print(f"   ⚠️  Skipped {skipped} unavailable video(s) (members-only, private, etc.)")

    data = {
        "channel_id": channel_id,
        "channel": channel,
        "channel_url": channel_url,
        "subscriber_count": subscriber_count,
        "video_count": len(videos),
        "videos": videos,
    }
    save_cached_metadata(cache_dir, shorts_url, data)
    return data


def srt_to_plain_text(path: Path) -> str:
    """Extract plain text from SRT/VTT file, stripping timestamps and cue numbers."""
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.match(r"^\d+$", line):
            continue
        if "-->" in line:
            continue
        if line.upper() == "WEBVTT" or line.startswith("WEBVTT "):
            continue
        lines.append(line)
    return " ".join(lines)


def find_transcript_file(transcripts_dir: Path, video_id: str) -> Optional[Path]:
    """Find transcript file for video (en.srt, en.vtt, etc.)."""
    for ext in ("srt", "vtt"):
        for lang in ("en",):
            p = transcripts_dir / f"{video_id}.{lang}.{ext}"
            if p.exists():
                return p
    return None


def build_output_json(
    channels_data: list[tuple[str, dict, int]],
    transcripts_dir: Path,
) -> dict[str, Any]:
    """Build final JSON with channel key as top-level keys, including transcript text per video."""
    out: dict[str, Any] = {}
    for channel_key, meta, _ in channels_data:
        videos = []
        for v in meta.get("videos", []):
            vid = v.copy()
            transcript_path = find_transcript_file(transcripts_dir, v["id"])
            vid["transcript"] = srt_to_plain_text(transcript_path) if transcript_path else ""
            videos.append(vid)

        out[channel_key] = {
            "channel_id": meta.get("channel_id", ""),
            "channel": meta.get("channel", ""),
            "channel_url": meta.get("channel_url", ""),
            "subscriber_count": meta.get("subscriber_count", 0),
            "video_count": meta.get("video_count", 0),
            "videos": videos,
        }
    return out


def main():
    parser = argparse.ArgumentParser(description="Ingest channels from channels.txt")
    parser.add_argument(
        "-c", "--channels-file",
        default=DEFAULT_CHANNELS_FILE,
        help=f"Path to channels list (default: {DEFAULT_CHANNELS_FILE})",
    )
    parser.add_argument(
        "-o", "--output",
        default=DEFAULT_OUTPUT_JSON,
        help=f"Output JSON path (default: {DEFAULT_OUTPUT_JSON})",
    )
    parser.add_argument(
        "--cache-dir",
        default=DEFAULT_CACHE_DIR,
        help=f"Cache directory (default: {DEFAULT_CACHE_DIR})",
    )
    parser.add_argument(
        "--cache-max-age",
        type=float,
        default=CACHE_MAX_AGE_HOURS,
        help=f"Cache max age in hours (default: {CACHE_MAX_AGE_HOURS})",
    )
    parser.add_argument(
        "--transcripts-dir",
        default="./transcripts",
        help="Directory for transcript files (default: ./transcripts)",
    )
    parser.add_argument(
        "--skip-transcripts",
        action="store_true",
        help="Skip downloading transcripts (metadata only)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Ignore cache and re-fetch all metadata",
    )
    args = parser.parse_args()

    # scraper/ is one level deeper than scripts/
    project_root = Path(__file__).resolve().parent.parent.parent
    channels_file = project_root / args.channels_file
    output_path = project_root / args.output
    cache_dir = project_root / args.cache_dir
    transcripts_dir = project_root / args.transcripts_dir

    if not channels_file.exists():
        print(f"❌ Channels file not found: {channels_file}", file=sys.stderr)
        sys.exit(1)

    urls = [
        line.strip()
        for line in channels_file.read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]

    if not urls:
        print("❌ No channel URLs in channels file", file=sys.stderr)
        sys.exit(1)

    print(f"📋 Found {len(urls)} channel(s) in {channels_file.name}")
    print()

    channels_data: list[tuple[str, dict, int]] = []
    max_age = 0.0 if args.no_cache else args.cache_max_age

    for i, url in enumerate(urls):
        if not is_channel_url(url):
            print(f"⏭️  Skipping invalid URL: {url}")
            continue

        channel_key = get_channel_key_from_url(url)
        shorts_url = get_shorts_url(url)
        print(f"[{i+1}/{len(urls)}] {channel_key}")

        try:
            meta = extract_channel_and_videos(shorts_url, cache_dir, max_age)
            video_count = len(meta.get("videos", []))
            print(f"   📊 {meta.get('channel', channel_key)}: {video_count} shorts, {meta.get('subscriber_count', 0):,} subs")

            if not args.skip_transcripts and video_count > 0:
                print(f"   📥 Downloading transcripts...")
                transcripts_dir.mkdir(parents=True, exist_ok=True)
                archive_file = str(transcripts_dir / "download_archive.txt")
                n = download_channel_shorts_transcripts(
                    url,
                    output_dir=str(transcripts_dir),
                    sub_langs=["en"],
                    max_videos=None,
                    sub_format="srt",
                    download_archive=archive_file,
                )
                print(f"   ✅ {len(n)} transcript(s)")
            else:
                print(f"   ⏭️  Skipping transcripts")
                n = []

            channels_data.append((channel_key, meta, len(n)))
        except Exception as e:
            print(f"   ❌ Error: {e}")
            continue
        print()

    out_json = build_output_json(channels_data, transcripts_dir)
    output_path.write_text(json.dumps(out_json, indent=2))
    print(f"💾 Wrote {output_path}")

    total_videos = sum(d["video_count"] for _, d, _ in channels_data)
    print(f"📊 Total: {len(channels_data)} channels, {total_videos} videos")


if __name__ == "__main__":
    main()
