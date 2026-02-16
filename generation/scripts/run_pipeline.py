#!/usr/bin/env python3
"""
Orchestrate the full pipeline: script → chunker → (images + voice) → prepare → render.

Calls into each module's run() function. Each layer handles its own caching.
Image and voice generation run concurrently after chunking.

Usage:
  python generation/scripts/run_pipeline.py -f content.txt
  python generation/scripts/run_pipeline.py -H 8d9dea719895c33a           # run for existing cache
  python generation/scripts/run_pipeline.py -f content.txt --step image  # invalidate image+ and run full pipeline
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


# image and voice are siblings; invalidating one does not invalidate the other
_STEPS_AFTER: dict[str, frozenset[str]] = {
    "script": frozenset({"script", "chunker", "image", "voice", "prepare", "video"}),
    "chunker": frozenset({"chunker", "image", "voice", "prepare", "video"}),
    "image": frozenset({"image", "prepare", "video"}),
    "voice": frozenset({"voice", "prepare", "video"}),
    "prepare": frozenset({"prepare", "video"}),
    "video": frozenset({"video"}),
}


def _steps_from(step: str) -> frozenset[str]:
    """Steps to invalidate: step and all subsequent (image/voice are independent)."""
    return _STEPS_AFTER[step]


def run(
    raw_content: str | None = None,
    *,
    cache_key: str | None = None,
    max_scenes: int | None = None,
    step: str | None = None,
) -> Path | None:
    """
    Run the full pipeline for raw content or an existing cache.

    Args:
        raw_content: Raw text to turn into a short video. Not required when cache_key is provided.
        cache_key: Use this cache key instead of computing from content. When provided without
                   raw_content, runs from step 2 (chunker) using cached script.md.
        max_scenes: Only generate first N scenes (for testing).
        step: Invalidate cache for STEP and all subsequent steps, then run full pipeline.
              One of: script, chunker, image, voice, prepare, video.

    Returns:
        Path to output video when full pipeline completes, else None.
    """
    hash_mode = cache_key is not None and not raw_content
    if hash_mode:
        if not (cache_path(cache_key) / "script.md").exists():
            error(f"Cache {cache_key} has no script.md. Provide content with -f to run from step 1.")
            raise ValueError("Cache missing script.md")
        if step == "script":
            error("Cannot run step 'script' in hash mode (no raw content). Use -f to provide content.")
            raise ValueError("Hash mode cannot run script step")
    else:
        if not raw_content or not raw_content.strip():
            error("No content provided. Use -f file or --hash CACHE_KEY.")
            raise ValueError("No content or cache_key")
        cache_key = content_hash(raw_content)
    info(f"🔑 cache_key: {cache_key}")

    invalidate_steps = _steps_from(step) if step else frozenset()
    if invalidate_steps:
        info(f"  Invalidating cache for: {', '.join(sorted(invalidate_steps))}")

    if hash_mode:
        info("  Hash mode: starting from chunker (using cached script.md)")

    script: str
    if hash_mode:
        script = (cache_path(cache_key) / "script.md").read_text(encoding="utf-8")
    else:
        set_step_context(1, 6)
        script = run_script(raw_content, cache_key, skip_cache="script" in invalidate_steps)

    set_step_context(2, 6)
    chunks = run_chunker(script, cache_key, skip_cache="chunker" in invalidate_steps)

    set_step_context(3, 6)
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_images = executor.submit(
            run_images,
            chunks,
            cache_key,
            max_scenes=max_scenes,
            skip_cache="image" in invalidate_steps,
        )
        future_voice = executor.submit(
            run_voice,
            chunks,
            cache_key,
            max_scenes=max_scenes,
            skip_cache="voice" in invalidate_steps,
        )
        for future in as_completed([future_images, future_voice]):
            future.result()

    set_step_context(4, 6)
    try:
        prepare(
            cache_key,
            video_public(),
            use_whisper=True,
            whisper_model="base.en",
            skip_cache="prepare" in invalidate_steps,
        )
    except Exception as e:
        error(str(e))
        raise

    set_step_context(6, 6)
    try:
        output_path = run_render(cache_key, skip_cache="video" in invalidate_steps)
    except Exception as e:
        error(str(e))
        raise

    out_dir = cache_path(cache_key)
    info("")
    info("✅ Done")
    info(f"   📁 Output: {out_dir}")
    info(f"   📝 Script:  {out_dir / 'script.md'}")
    info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
    info(f"   🖼️ Images:  {out_dir / 'images'}")
    info(f"   🔊 Voice:   {out_dir / 'voice'}")
    info(f"   🎬 Video:   {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Run full pipeline: script → chunker → images + voice → prepare → render."
    )
    parser.add_argument("content", nargs="?", help="Raw text content")
    parser.add_argument("-f", "--file", help="Path to file containing raw content")
    parser.add_argument(
        "-H",
        "--hash",
        metavar="CACHE_KEY",
        help="Run pipeline for existing cache (e.g. 8d9dea719895c33a). Starts from chunker.",
    )
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
        help="Invalidate cache for STEP and all subsequent steps, then run full pipeline",
    )
    args = parser.parse_args()

    raw_content = ""
    if args.file:
        raw_content = Path(args.file).read_text(encoding="utf-8")
    elif args.content:
        raw_content = args.content
    elif not sys.stdin.isatty():
        raw_content = sys.stdin.read()

    if args.hash:
        if raw_content.strip():
            error("Error: Cannot use -f/ content with --hash. Use one or the other.")
            sys.exit(1)
        raw_content = None
    elif not raw_content.strip():
        parser.print_help()
        error("Error: No content provided. Use -f file or -H CACHE_KEY.")
        sys.exit(1)

    try:
        run(
            raw_content if raw_content else None,
            cache_key=args.hash,
            max_scenes=args.max_scenes,
            step=args.step,
        )
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
