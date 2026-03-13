#!/usr/bin/env python3
"""
Download transcripts of all short form videos (Shorts) within a YouTube channel.

Uses yt-dlp to fetch transcripts/subtitles only (no video download).
Targets the channel's Shorts tab (youtube.com/@channel/shorts).

Usage:
    python scraper/download_shorts_transcripts.py "https://www.youtube.com/@ChannelName" [--output-dir transcripts]

Reference: podsearch video_downloader.py (yt-dlp), hook_finder.py (subprocess/yt-dlp)
"""

import argparse
import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse

import yt_dlp

DEFAULT_OUTPUT_DIR = str(Path(__file__).resolve().parent / "transcripts")


def get_shorts_url(channel_url: str) -> str:
    """
    Convert a channel URL to its Shorts tab URL.

    Supports: @handle, /channel/ID, /c/name, /user/name
    """
    url = channel_url.strip().rstrip("/")
    parsed = urlparse(url)
    path = parsed.path.strip("/")

    # Remove existing tab paths (videos, shorts, live, etc.)
    tab_paths = ("videos", "shorts", "live", "streams", "playlists", "community", "featured")
    path_parts = [p for p in path.split("/") if p.lower() not in tab_paths]

    if not path_parts:
        raise ValueError(f"Invalid channel URL: {channel_url}")

    # Rebuild path with /shorts
    new_path = "/".join(path_parts) + "/shorts"

    return urlunparse((parsed.scheme or "https", parsed.netloc or "www.youtube.com", new_path, parsed.params, parsed.query, ""))


def is_channel_url(url: str) -> bool:
    """Check if URL is a YouTube channel URL."""
    patterns = [
        r"youtube\.com/@[^/\s]+",
        r"youtube\.com/c/[^/\s]+",
        r"youtube\.com/channel/[^/\s]+",
        r"youtube\.com/user/[^/\s]+",
    ]
    return any(re.search(p, url, re.I) for p in patterns)


def _load_archive_ids(archive_path: Optional[str]) -> set[str]:
    """Load video IDs from yt-dlp archive file (format: 'youtube VIDEO_ID' per line)."""
    if not archive_path or not Path(archive_path).exists():
        return set()
    ids = set()
    for line in Path(archive_path).read_text().splitlines():
        parts = line.strip().split()
        if len(parts) >= 2:
            ids.add(parts[1])
    return ids


def _append_to_archive(archive_path: str, video_id: str, lock: threading.Lock) -> None:
    """Append video to archive file (thread-safe)."""
    with lock:
        with open(archive_path, "a") as f:
            f.write(f"youtube {video_id}\n")


def download_channel_shorts_transcripts(
    channel_url: str,
    output_dir: str = DEFAULT_OUTPUT_DIR,
    sub_langs: Optional[list] = None,
    max_videos: Optional[int] = None,
    sub_format: str = "srt",
    download_archive: Optional[str] = None,
    concurrent: int = 100,
) -> list[str]:
    """
    Download transcripts for all Shorts in a channel.

    Args:
        channel_url: YouTube channel URL (@handle, /channel/, /c/, /user/)
        output_dir: Directory to save transcript files
        sub_langs: Subtitle languages (default: ['en'])
        max_videos: Max number of videos to process (None = all)
        sub_format: Subtitle format - srt, vtt, ass, etc. (default: srt)
        download_archive: Path to archive file to skip already-downloaded videos (caching)
        concurrent: Number of parallel download threads (default: 100)

    Returns:
        List of downloaded transcript file paths
    """
    if sub_langs is None:
        sub_langs = ["en"]

    shorts_url = get_shorts_url(channel_url)
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    archive_ids = _load_archive_ids(download_archive)
    archive_lock = threading.Lock()
    result_lock = threading.Lock()
    downloaded_files: list[str] = []
    video_metadata: list[dict] = []
    playlist_order: dict[str, int] = {}

    flat_opts: dict = {"quiet": True, "no_warnings": True, "extract_flat": True, "ignoreerrors": True}
    if max_videos:
        flat_opts["playlistend"] = max_videos
    with yt_dlp.YoutubeDL(flat_opts) as ydl:
        try:
            info = ydl.extract_info(shorts_url, download=False)
            entries = info.get("entries") or []
            for i, e in enumerate(entries):
                if e and e.get("id"):
                    playlist_order[e["id"]] = i
        except Exception:
            pass

    video_urls: list[tuple[str, str]] = []
    for vid, idx in sorted(playlist_order.items(), key=lambda x: x[1]):
        if vid in archive_ids:
            continue
        video_urls.append((vid, f"https://www.youtube.com/shorts/{vid}"))
        if max_videos and len(video_urls) >= max_videos:
            break

    if not video_urls:
        print("📋 All videos already in archive or no videos to process.")
        return []

    print(f"📺 Channel Shorts URL: {shorts_url}")
    print(f"📁 Output: {out_path.absolute()}")
    print(f"🌐 Languages: {', '.join(sub_langs)}")
    print(f"🧵 Concurrent: {concurrent} threads")
    print(f"📊 Videos to download: {len(video_urls)}")
    print()

    def download_one(vid: str, url: str) -> Optional[dict]:
        upload_date: Optional[str] = None
        view_count: Optional[int] = None
        try:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
                info = ydl.extract_info(url, download=False)
                if info:
                    upload_date = info.get("upload_date")
                    view_count = info.get("view_count")
        except Exception:
            pass

        opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": sub_langs,
            "subtitlesformat": "best" if sub_format == "best" else f"{sub_format}/best",
            "outtmpl": str(out_path / "%(id)s.%(ext)s"),
            "ignoreerrors": True,
            "no_warnings": True,
            "quiet": True,
        }

        downloaded = [False]

        def progress_hook(d):
            if d.get("status") == "finished":
                downloaded[0] = True
                filename = d.get("filename", "")
                path_name = Path(filename).name if filename else f"{vid}.srt"
                with result_lock:
                    downloaded_files.append(filename)
                    date_str = _format_upload_date(upload_date)
                    suffix = f" ({date_str})" if date_str else ""
                    print(f"✅ {path_name}{suffix}")
            elif d.get("status") == "error":
                with result_lock:
                    print(f"❌ Error: {vid}")

        opts["progress_hooks"] = [progress_hook]
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            if not downloaded[0]:
                return None
            if download_archive:
                _append_to_archive(download_archive, vid, archive_lock)
            path_name = f"{vid}.srt"
            transcript_path = None
            for p in out_path.glob(f"{vid}.*"):
                path_name = p.name
                transcript_path = p
                break
            transcript = _srt_to_plain_text(transcript_path) if transcript_path else ""
            return {
                "id": vid,
                "upload_date": upload_date,
                "view_count": view_count,
                "path": path_name,
                "transcript": transcript,
            }
        except Exception:
            with result_lock:
                print(f"❌ Error: {vid}")
            return None

    with ThreadPoolExecutor(max_workers=concurrent) as executor:
        futures = {executor.submit(download_one, vid, url): vid for vid, url in video_urls}
        for future in as_completed(futures):
            meta = future.result()
            if meta:
                with result_lock:
                    video_metadata.append(meta)

    video_metadata.sort(key=lambda m: playlist_order.get(m["id"], 999999))

    index_path = out_path / "index.json"
    index_data = {
        "channel_url": shorts_url,
        "videos": video_metadata,
    }
    index_path.write_text(json.dumps(index_data, indent=2))
    print(f"\n📋 Wrote {index_path}")

    return downloaded_files


def _srt_to_plain_text(path: Path) -> str:
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


def _format_upload_date(upload_date: Optional[str]) -> Optional[str]:
    """Convert YYYYMMDD to YYYY-MM-DD for display."""
    if not upload_date or len(upload_date) != 8:
        return None
    try:
        return f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    except (IndexError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Download transcripts of all Shorts in a YouTube channel"
    )
    parser.add_argument(
        "channel_url",
        help="YouTube channel URL (e.g. https://www.youtube.com/@ChannelName)",
    )
    parser.add_argument(
        "-o", "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for transcript files (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "-l", "--lang",
        default="en",
        help="Subtitle language code (default: en). Use comma for multiple: en,es",
    )
    parser.add_argument(
        "-n", "--max-videos",
        type=int,
        default=None,
        help="Maximum number of shorts to process (default: all)",
    )
    parser.add_argument(
        "-f", "--format",
        default="srt",
        choices=["srt", "vtt", "ass", "best"],
        help="Subtitle format (default: srt)",
    )
    parser.add_argument(
        "-j", "--concurrent",
        type=int,
        default=100,
        help="Number of parallel download threads (default: 100)",
    )

    args = parser.parse_args()

    if not is_channel_url(args.channel_url):
        print("❌ Error: URL does not appear to be a YouTube channel.", file=sys.stderr)
        print("   Supported: @handle, /channel/, /c/, /user/", file=sys.stderr)
        sys.exit(1)

    sub_langs = [s.strip() for s in args.lang.split(",") if s.strip()]

    try:
        files = download_channel_shorts_transcripts(
            args.channel_url,
            output_dir=args.output_dir,
            sub_langs=sub_langs,
            max_videos=args.max_videos,
            sub_format=args.format,
            concurrent=args.concurrent,
        )
        print(f"\n🎉 Done. Downloaded {len(files)} transcript(s) to {args.output_dir}")
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
