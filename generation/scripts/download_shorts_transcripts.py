#!/usr/bin/env python3
"""
Download transcripts of all short form videos (Shorts) within a YouTube channel.

Uses yt-dlp to fetch transcripts/subtitles only (no video download).
Targets the channel's Shorts tab (youtube.com/@channel/shorts).

Usage:
    python download_shorts_transcripts.py "https://www.youtube.com/@ChannelName" [--output-dir transcripts]
    
Reference: podsearch video_downloader.py (yt-dlp), hook_finder.py (subprocess/yt-dlp)
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse

import yt_dlp


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


def download_channel_shorts_transcripts(
    channel_url: str,
    output_dir: str = "./transcripts",
    sub_langs: Optional[list] = None,
    max_videos: Optional[int] = None,
    sub_format: str = "srt",
    download_archive: Optional[str] = None,
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
    
    Returns:
        List of downloaded transcript file paths
    """
    if sub_langs is None:
        sub_langs = ["en"]
    
    shorts_url = get_shorts_url(channel_url)
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    downloaded_files: list[str] = []
    
    options = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": sub_langs,
        "subtitlesformat": "best" if sub_format == "best" else f"{sub_format}/best",
        "outtmpl": str(out_path / "%(id)s.%(ext)s"),
        "ignoreerrors": True,
        "no_warnings": True,
        "quiet": False,
        "progress_hooks": [_make_progress_hook(downloaded_files)],
    }
    
    if max_videos:
        options["playlistend"] = max_videos
    if download_archive:
        options["download_archive"] = download_archive

    print(f"📺 Channel Shorts URL: {shorts_url}")
    print(f"📁 Output: {out_path.absolute()}")
    print(f"🌐 Languages: {', '.join(sub_langs)}")
    if max_videos:
        print(f"📊 Max videos: {max_videos}")
    print()
    
    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([shorts_url])
    
    return downloaded_files


def _make_progress_hook(collected: list[str]):
    def progress_hook(d):
        if d.get("status") == "finished":
            filename = d.get("filename", "")
            if filename and filename not in collected:
                collected.append(filename)
            print(f"✅ {Path(filename).name}")
        elif d.get("status") == "error":
            print(f"❌ Error: {d.get('filename', 'Unknown')}")
    return progress_hook


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
        default="./transcripts",
        help="Output directory for transcript files (default: ./transcripts)",
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
