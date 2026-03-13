#!/usr/bin/env python3
"""
Upload rendered shorts to YouTube, TikTok, and/or Instagram Reels.

Platform selection:
- Config: add `upload.platforms: [youtube, tiktok, instagram]` to your YAML config.
- CLI: --platforms youtube tiktok instagram (overrides config).
- Default: [youtube] if neither specified.

Usage:
  python generation/scripts/run.py upload/upload.py --cache-key CACHE_KEY -c default
  python generation/scripts/run.py upload/upload.py --breakdown-hash HASH -c default --platforms youtube tiktok
"""

import argparse
import sys

from config_loader import load_config
from logger import error, info
from upload.upload_common import VALID_PLATFORMS, build_upload_list


def _resolve_platforms(args) -> list[str]:
    """Resolve platforms from --platforms CLI or config. Default [youtube]."""
    if getattr(args, "platforms", None):
        return [p.lower() for p in args.platforms if p.lower() in VALID_PLATFORMS]
    if args.config:
        try:
            config = load_config(args.config)
            if config.upload and config.upload.platforms:
                return [p.lower() for p in config.upload.platforms if p.lower() in VALID_PLATFORMS]
        except Exception:
            pass
    return ["youtube"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload shorts to YouTube, TikTok, and/or Instagram Reels."
    )
    parser.add_argument("-c", "--config", help="Config YAML (required for --cache-key and --breakdown-hash)")
    parser.add_argument("--cache-key", help="Cache key: video from config cache, metadata from chunks.json")
    parser.add_argument("--video", help="Path to video file (alternative to --cache-key)")
    parser.add_argument(
        "--breakdown-hash",
        metavar="HASH",
        help="Source hash: upload all videos from cache/_breakdown/{hash}/.",
    )
    parser.add_argument(
        "--platforms",
        nargs="+",
        choices=list(VALID_PLATFORMS),
        metavar="PLATFORM",
        help="Platforms to upload to (youtube, tiktok, instagram). Overrides config.",
    )
    parser.add_argument("--title", help="Override title")
    parser.add_argument("--description", help="Override description")
    parser.add_argument("--privacy", default="private", choices=("public", "unlisted", "private"))
    parser.add_argument("--publish-at", help="Explicit publish time (e.g. '2025-02-20 09:00')")
    parser.add_argument("--default-time", default="09:00", help="Default time of day for next slot (HH:MM)")
    parser.add_argument("--tags", help="Comma-separated tags (YouTube)")
    parser.add_argument(
        "--tiktok-privacy",
        default="PUBLIC_TO_EVERYONE",
        choices=("PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"),
    )
    parser.add_argument("--tiktok-disable-comment", action="store_true")
    parser.add_argument("--check-token", action="store_true", help="Check YouTube token only; then exit.")
    args, remaining = parser.parse_known_args()

    if args.check_token:
        from upload.upload_youtube import check_token_valid
        ok = check_token_valid()
        sys.exit(0 if ok else 1)

    if (args.cache_key or args.breakdown_hash) and not args.config:
        error("--config is required for --cache-key and --breakdown-hash.")
        sys.exit(1)

    if args.config:
        config = load_config(args.config)
        args._config_hash = config.hash
    else:
        args._config_hash = ""

    if sum(1 for x in (args.cache_key, args.video, args.breakdown_hash) if x) != 1:
        error("Provide exactly one of: --cache-key, --video, or --breakdown-hash.")
        sys.exit(1)

    platforms = _resolve_platforms(args)
    if not platforms:
        error("No valid platforms. Use --platforms or config upload.platforms.")
        sys.exit(1)

    info(f"Uploading to: {', '.join(platforms)}")

    items, _, persist_context = build_upload_list(args)
    if not items:
        info("No videos to upload.")
        return

    for platform in platforms:
        if platform == "youtube":
            from upload.upload_youtube import run_uploads as run_youtube
            run_youtube(items, args, persist_context)
        elif platform == "tiktok":
            from upload.upload_tiktok import run_uploads as run_tiktok
            run_tiktok(items, args, persist_context)
        elif platform == "instagram":
            from upload.upload_instagram import run_uploads as run_instagram
            run_instagram(items, args, persist_context)


if __name__ == "__main__":
    main()
