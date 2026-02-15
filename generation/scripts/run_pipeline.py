#!/usr/bin/env python3
"""
Orchestrate the full pipeline: script → chunker → (images + voice) → prepare → render.

Calls into each module's run() function. Each layer handles its own caching.
Image and voice generation run concurrently after chunking.

Usage:
  python generation/scripts/run_pipeline.py -f content.txt
  python generation/scripts/run_pipeline.py -f content.txt --step image  # run up to image, skip cache
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
        "--step",
        choices=["script", "chunker", "image", "voice", "prepare", "video"],
        metavar="STEP",
        help="Run up to and including STEP, skipping cache for it (script, chunker, image, voice, prepare, video)",
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

    step_target = args.step
    if step_target:
        info(f"  Running up to {step_target} (skipping cache for {step_target})")

    set_step_context(1, 6)
    script = run_script(raw_content, cache_key, skip_cache=step_target == "script")
    if step_target == "script":
        out_dir = cache_path(cache_key)
        info("")
        info(f"✅ Done (step 1)")
        info(f"   📁 Output: {out_dir}")
        info(f"   📝 Script:  {out_dir / 'script.md'}")
        return
    set_step_context(2, 6)
    chunks = run_chunker(script, cache_key, skip_cache=step_target == "chunker")
    if step_target == "chunker":
        out_dir = cache_path(cache_key)
        info("")
        info(f"✅ Done (step 2)")
        info(f"   📁 Output: {out_dir}")
        info(f"   📝 Script:  {out_dir / 'script.md'}")
        info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
        return

    set_step_context(3, 6)
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_images = executor.submit(
            run_images,
            chunks,
            cache_key,
            max_scenes=args.max_scenes,
            skip_cache=step_target == "image",
        )
        future_voice = executor.submit(
            run_voice,
            chunks,
            cache_key,
            max_scenes=args.max_scenes,
            skip_cache=step_target == "voice",
        )
        for future in as_completed([future_images, future_voice]):
            future.result()

    if step_target in ("image", "voice"):
        out_dir = cache_path(cache_key)
        info("")
        info(f"✅ Done (step 3)")
        info(f"   📁 Output: {out_dir}")
        info(f"   📝 Script:  {out_dir / 'script.md'}")
        info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
        info(f"   🖼️ Images:  {out_dir / 'images'}")
        info(f"   🔊 Voice:   {out_dir / 'voice'}")
        return

    set_step_context(4, 6)
    try:
        prepare(
            cache_key,
            video_public(),
            use_whisper=True,
            whisper_model="base.en",
            skip_cache=step_target == "prepare",
        )
    except Exception as e:
        error(str(e))
        sys.exit(1)

    if step_target == "prepare":
        out_dir = cache_path(cache_key)
        info("")
        info(f"✅ Done (step 4)")
        info(f"   📁 Output: {out_dir}")
        info(f"   📝 Script:  {out_dir / 'script.md'}")
        info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
        info(f"   🖼️ Images:  {out_dir / 'images'}")
        info(f"   🔊 Voice:   {out_dir / 'voice'}")
        info(f"   📦 Manifest: {video_public() / 'shortgen' / cache_key / 'manifest.json'}")
        return

    set_step_context(6, 6)
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
