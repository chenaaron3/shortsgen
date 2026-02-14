#!/usr/bin/env python3
"""
Orchestrate the full pipeline: script → chunker → (images + voice) → prepare → render.

Calls into each module's run() function. Each layer handles its own caching.
Image and voice generation run concurrently after chunking.

Usage:
  python generation/scripts/run_pipeline.py -f content.txt
  cat content.txt | python generation/scripts/run_pipeline.py
"""

import argparse
import hashlib
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

from path_utils import cache_path, env_path, video_public
from logger import error, info, set_step_context
from generate_images import run as run_images
from generate_script import run as run_script
from generate_voice import run as run_voice
from prepare_remotion_assets import prepare
from render_video import run as run_render
from run_chunker import run as run_chunker

load_dotenv(env_path())


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def main():
    parser = argparse.ArgumentParser(
        description="Run full pipeline: script → chunker → images + voice → prepare → render."
    )
    parser.add_argument("content", nargs="?", help="Raw text content")
    parser.add_argument("-f", "--file", help="Path to file containing raw content")
    parser.add_argument(
        "--max-scenes",
        type=int,
        default=None,
        metavar="N",
        help="Only generate first N scenes (for testing)",
    )
    parser.add_argument(
        "--skip-render",
        action="store_true",
        help="Stop after prepare, do not render video",
    )
    parser.add_argument(
        "--no-whisper",
        action="store_true",
        help="Use scene-level captions instead of Whisper word-level",
    )
    args = parser.parse_args()

    raw_content = ""
    if args.file:
        raw_content = Path(args.file).read_text(encoding="utf-8")
    elif args.content:
        raw_content = args.content
    elif not sys.stdin.isatty():
        raw_content = sys.stdin.read()

    if not raw_content.strip():
        parser.print_help()
        error("Error: No content provided.")
        sys.exit(1)

    cache_key = content_hash(raw_content)
    info(f"🔑 cache_key: {cache_key}")

    set_step_context(1, 5)
    script = run_script(raw_content, cache_key)
    set_step_context(2, 5)
    chunks = run_chunker(script, cache_key)
    set_step_context(3, 5)
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_images = executor.submit(
            run_images,
            chunks,
            cache_key,
            max_scenes=args.max_scenes,
        )
        future_voice = executor.submit(
            run_voice,
            chunks,
            cache_key,
            max_scenes=args.max_scenes,
        )
        for future in as_completed([future_images, future_voice]):
            future.result()

    set_step_context(4, 5)
    try:
        prepare(
            cache_key,
            video_public(),
            use_whisper=not args.no_whisper,
            whisper_model="base.en",
        )
    except Exception as e:
        error(str(e))
        sys.exit(1)

    if args.skip_render:
        out_dir = cache_path(cache_key)
        info("")
        info("✅ Done (--skip-render)")
        info(f"   📁 Output: {out_dir}")
        info(f"   📝 Script:  {out_dir / 'script.md'}")
        info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
        info(f"   🖼️ Images:  {out_dir / 'images'}")
        info(f"   🔊 Voice:   {out_dir / 'voice'}")
        info(f"   📦 Manifest: {video_public() / 'shortgen' / cache_key / 'manifest.json'}")
        info(f"   🎬 Render:  npx remotion render ShortVideo -o {cache_path(cache_key, 'short.mp4')} --props='{{\"cacheKey\":\"{cache_key}\"}}'")
        return

    set_step_context(5, 5)
    try:
        output_path = run_render(cache_key)
    except Exception as e:
        error(str(e))
        sys.exit(1)

    out_dir = cache_path(cache_key)
    info("")
    info("✅ Done")
    info(f"   📁 Output: {out_dir}")
    info(f"   📝 Script:  {out_dir / 'script.md'}")
    info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
    info(f"   🖼️ Images:  {out_dir / 'images'}")
    info(f"   🔊 Voice:   {out_dir / 'voice'}")
    info(f"   🎬 Video:   {output_path}")


if __name__ == "__main__":
    main()
