#!/usr/bin/env python3
"""
Orchestrate source breakdown → pipeline runs.

Break down source material (book, podcast transcript) into atomic idea nuggets,
then run the full pipeline once per nugget. Each nugget's summary becomes the
raw_content for run_pipeline.

Usage:
  python generation/scripts/run_source_pipeline.py -f book.txt
  python generation/scripts/run_source_pipeline.py -f book.txt --max-nuggets 3
"""

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

from path_utils import env_path, breakdown_cache_path, cache_path
from logger import error, info, progress
from breakdown_source import run as run_breakdown, source_hash
from run_pipeline import run as run_pipeline

load_dotenv(env_path())


def write_videos_markdown(source_key: str, nuggets: list, source_name: str = "") -> Path:
    """Write videos.md next to breakdown.json with links to generated videos."""
    breakdown_dir = breakdown_cache_path(source_key).parent
    breakdown_dir.mkdir(parents=True, exist_ok=True)
    md_path = breakdown_dir / "videos.md"

    lines = [
        "# Generated Videos",
        "",
        f"*Source: {source_name}*" if source_name else "",
        "",
    ]
    if source_name:
        lines.append("")

    for i, n in enumerate(nuggets, 1):
        ck = getattr(n, "cache_key", None) or (n.get("cache_key") if isinstance(n, dict) else None)
        if not ck:
            continue
        video_path = cache_path(ck, "short.mp4")
        rel = f"../../{ck}/short.mp4"  # from cache/_breakdowns/X/ to cache/Y/short.mp4
        title = getattr(n, "title", None) or (n.get("title") if isinstance(n, dict) else "?")
        link = f"[{title}]({rel})"
        flag = " *(missing)*" if not video_path.exists() else ""
        lines.append(f"{i}. {link}{flag}")

    md_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return md_path


def main():
    parser = argparse.ArgumentParser(
        description="Break down source into nuggets, run pipeline once per nugget."
    )
    parser.add_argument("-f", "--file", required=True, help="Path to source file (book or transcript, markdown)")
    parser.add_argument(
        "--skip-breakdown-cache",
        action="store_true",
        help="Regenerate breakdown even when cached",
    )
    parser.add_argument(
        "--max-scenes",
        type=int,
        default=None,
        metavar="N",
        help="Pass through to run_pipeline: only generate first N scenes per nugget",
    )
    parser.add_argument(
        "--max-nuggets",
        type=int,
        default=None,
        metavar="N",
        help="Only process first N nuggets (for testing)",
    )
    parser.add_argument(
        "--breakdown-only",
        action="store_true",
        help="Only run breakdown, skip downstream pipeline. Print nugget JSON to stdout.",
    )
    args = parser.parse_args()

    source_path = Path(args.file)
    if not source_path.exists():
        error(f"Error: File not found: {source_path}")
        sys.exit(1)

    source_content = source_path.read_text(encoding="utf-8")
    if not source_content.strip():
        error("Error: Source file is empty.")
        sys.exit(1)

    source_key = source_hash(source_content)
    info(f"📚 Source: {source_path.name}")
    info(f"🔑 source_key: {source_key}")

    nuggets = run_breakdown(
        source_content,
        source_key,
        skip_cache=args.skip_breakdown_cache,
    )

    if args.max_nuggets:
        nuggets = nuggets[: args.max_nuggets]
        info(f"  Limiting to first {args.max_nuggets} nuggets")

    md_path = write_videos_markdown(source_key, nuggets, source_path.name)
    info(f"  📄 {md_path}")

    if args.breakdown_only:
        out = {"nuggets": [n.model_dump() for n in nuggets]}
        print(json.dumps(out, indent=2))
        return

    total = len(nuggets)
    info("")
    info(f"▶ Running pipeline for {total} nugget(s)")
    info("─" * 50)

    failed = []
    for i, nugget in enumerate(nuggets, 1):
        progress(i, total, f"{nugget.id} — {nugget.title}")
        try:
            run_pipeline(nugget.summary, max_scenes=args.max_scenes)
            write_videos_markdown(source_key, nuggets, source_path.name)
        except Exception:
            failed.append(nugget.id)

    info("")
    if failed:
        info(f"⚠️ {len(failed)} nugget(s) failed: {failed}")
        sys.exit(1)
    info(f"✅ Done — {total} video(s) generated")


if __name__ == "__main__":
    main()
