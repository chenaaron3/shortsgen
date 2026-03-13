#!/usr/bin/env python3
"""
Orchestrate the full pipeline: script → chunker → (images + voice) → prepare → render.

Calls into each module's run() function. Each layer handles its own caching.
Image and voice generation run concurrently after chunking.

Usage:
  python generation/scripts/pipeline/run_pipeline.py -f content.txt -c configs/default.yaml
  python generation/scripts/pipeline/run_pipeline.py -f content.txt -c default claude-sonnet
  python generation/scripts/pipeline/run_pipeline.py -H 8d9dea719895c33a -c configs/default.yaml
  python generation/scripts/pipeline/run_pipeline.py -f content.txt -c configs/claude-sonnet.yaml --step image
"""

import argparse
import contextvars
import hashlib
import json
import sys
import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

from config_loader import load_config
from path_utils import env_path, video_cache_path, video_public
from logger import error, info, progress, set_step_context
from usage_trace import flush_traces_for_key, flush_traces_to_disk, print_batch_summary, print_summary, set_context as usage_set_context
from pipeline.generate_images import run as run_images
from pipeline.generate_script import run as run_script
from pipeline.generate_voice import run as run_voice
from pipeline.prepare_remotion_assets import prepare
from pipeline.render_video import run as run_render
from pipeline.run_chunker import run as run_chunker
from pipeline.write_eval_dataset import write_eval_dataset

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


def _finish_partial(cache_key: str, config_hash: str) -> None:
    """Print summary and output paths when pipeline breaks early."""
    out_dir = video_cache_path(cache_key, config_hash)
    usage_path = video_cache_path(cache_key, config_hash, "usage.json")
    flush_traces_for_key(config_hash, cache_key)
    print_summary(usage_path)
    if usage_path.exists():
        try:
            data = json.loads(usage_path.read_text(encoding="utf-8"))
            est = data.get("estimate", {})
            if est.get("total_usd", 0) > 0:
                info(f"   📊 Usage trace: {usage_path}")
                info(f"   💰 Est. cost: ${est['total_usd']:.4f} (LLM ${est.get('llm_usd', 0):.4f} + images ${est.get('images_usd', 0):.4f} + voice ${est.get('voice_usd', 0):.4f})")
        except Exception:
            pass
    info("")
    info("✅ Done (stopped early)")
    info(f"   📁 Output: {out_dir}")


def run(
    raw_content: str | None = None,
    *,
    cache_key: str | None = None,
    config,
    config_hash: str,
    max_scenes: int | None = None,
    step: str | None = None,
    break_at: str | None = None,
    prototype: bool = False,
) -> Path | None:
    """
    Run the full pipeline for raw content or an existing cache.

    Args:
        raw_content: Raw text to turn into a short video. Not required when cache_key is provided.
        cache_key: Use this cache key instead of computing from content. When provided without
                   raw_content, runs from step 2 (chunker) using cached script.md.
        config: Pipeline config (from config_loader).
        config_hash: Hash of config for cache paths.
        max_scenes: Only generate first N scenes (for testing).
        step: Invalidate cache for STEP and all subsequent steps, then run full pipeline.
        break_at: Stop after completing this step (script, chunker, image, prepare, video).
                  image covers both image and voice phase.
        prototype: Use cheap text-to-image only (Replicate FLUX Schnell); no mascot, no img2img transitions.

    Returns:
        Path to output video when full pipeline completes, else None.
    """
    hash_mode = cache_key is not None and not raw_content
    if hash_mode:
        script_path = video_cache_path(cache_key, config_hash, "script.md")
        if not script_path.exists():
            error(f"Cache {cache_key} has no script.md for this config. Provide content with -f to run from step 1.")
            raise ValueError("Cache missing script.md")
        if step == "script":
            error("Cannot run step 'script' in hash mode (no raw content). Use -f to provide content.")
            raise ValueError("Hash mode cannot run script step")
    else:
        if not raw_content or not raw_content.strip():
            error("No content provided. Use -f file or -H CACHE_KEY.")
            raise ValueError("No content or cache_key")
        cache_key = content_hash(raw_content)
    info(f"🔑 cache_key: {cache_key} | config: {config.name}")

    usage_set_context(cache_key, config_hash)
    invalidate_steps = _steps_from(step) if step else frozenset()
    if invalidate_steps:
        info(f"  Invalidating cache for: {', '.join(sorted(invalidate_steps))}")

    if hash_mode:
        info("  Hash mode: starting from chunker (using cached script.md)")
    if prototype:
        info("  Prototype mode: cheap text-to-image (no mascot) + free readaloud TTS")

    script: str
    if hash_mode:
        script = video_cache_path(cache_key, config_hash, "script.md").read_text(encoding="utf-8")
    else:
        set_step_context(1, 6)
        script = run_script(raw_content, cache_key, config, config_hash, skip_cache="script" in invalidate_steps)

    if break_at == "script":
        _finish_partial(cache_key, config_hash)
        return None

    set_step_context(2, 6)
    chunks = run_chunker(script, cache_key, config, config_hash, skip_cache="chunker" in invalidate_steps)

    if break_at == "chunker":
        _finish_partial(cache_key, config_hash)
        return None

    set_step_context(3, 6)
    # ThreadPoolExecutor workers don't inherit contextvars; each worker needs its own context copy
    def _run_images():
        run_ctx = contextvars.copy_context()
        return run_ctx.run(
            lambda: run_images(
                chunks,
                cache_key,
                config_hash,
                max_scenes=max_scenes,
                skip_cache="image" in invalidate_steps,
                prototype=prototype,
                model=config.image.model if config.image else None,
            )
        )

    def _run_voice():
        run_ctx = contextvars.copy_context()
        return run_ctx.run(
            lambda: run_voice(
                chunks,
                cache_key,
                config_hash,
                max_scenes=max_scenes,
                skip_cache="voice" in invalidate_steps,
                prototype=prototype,
            )
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_images = executor.submit(_run_images)
        future_voice = executor.submit(_run_voice)
        for future in as_completed([future_images, future_voice]):
            future.result()

    if break_at in ("image", "voice"):
        _finish_partial(cache_key, config_hash)
        return None

    set_step_context(4, 6)
    try:
        prepare(
            cache_key,
            config_hash,
            video_public(),
            use_whisper=True,
            whisper_model="base" if prototype else "distil-large-v3",
            skip_cache="prepare" in invalidate_steps,
        )
    except Exception as e:
        error(str(e))
        raise

    if break_at == "prepare":
        _finish_partial(cache_key, config_hash)
        return None

    set_step_context(6, 6)
    try:
        output_path = run_render(cache_key, config_hash, skip_cache="video" in invalidate_steps, prototype=prototype)
    except Exception as e:
        error(str(e))
        raise

    out_dir = video_cache_path(cache_key, config_hash)
    usage_path = video_cache_path(cache_key, config_hash, "usage.json")
    flush_traces_for_key(config_hash, cache_key)
    print_summary(usage_path)
    if usage_path.exists():
        try:
            data = json.loads(usage_path.read_text(encoding="utf-8"))
            est = data.get("estimate", {})
            if est.get("total_usd", 0) > 0:
                info(f"   📊 Usage trace: {usage_path}")
                info(f"   💰 Est. cost: ${est['total_usd']:.4f} (LLM ${est.get('llm_usd', 0):.4f} + images ${est.get('images_usd', 0):.4f} + voice ${est.get('voice_usd', 0):.4f})")
        except Exception:
            pass
    info("")
    info("✅ Done")
    info(f"   📁 Output: {out_dir}")
    info(f"   📝 Script:  {out_dir / 'script.md'}")
    info(f"   ✂️ Chunks:  {out_dir / 'chunks.json'}")
    info(f"   🖼️ Images:  {out_dir / 'images'}")
    info(f"   🔊 Voice:   {out_dir / 'voice'}")
    info(f"   🎬 Video:   {output_path}")
    return output_path


def run_batch(
    items: list,
    configs: list,
    concurrency: int = 2,
    on_config_enter: Callable[..., None] | None = None,
    on_item_done: Callable[..., None] | None = None,
    **run_kwargs,
) -> None:
    """
    Run the pipeline for each (item, config) pair. Items need .original_text and .cache_key (or computed).
    Supports optional callbacks for source-pipeline features (e.g. write_videos_markdown).
    """
    for config in configs:
        config_hash = config.hash
        info("")
        info(f"── Config: {config.name} ──")

        if on_config_enter:
            on_config_enter(config, items)

        total = len(items)
        if total > 1:
            info(f"▶ Running pipeline for {total} item(s) (concurrency={concurrency})")
            info("─" * 50)

        failed = []
        done = 0
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {
                executor.submit(_run_one_item, item, config, config_hash, run_kwargs): item
                for item in items
            }
            for future in as_completed(futures):
                item = futures[future]
                try:
                    future.result()
                    done += 1
                    item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", "?")
                    item_title = item.get("title") if isinstance(item, dict) else getattr(item, "title", "?")
                    if total > 1:
                        progress(done, total, f"{item_id} — {item_title}")
                except Exception as e:
                    item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", "?")
                    failed.append(item_id)
                    done += 1
                    error(f"  {item_id} failed: {e}")
                    tb = "".join(traceback.format_exception(type(e), e, e.__traceback__))
                    for line in tb.rstrip().split("\n"):
                        error(f"    {line}")
                    if total > 1:
                        progress(done, total, f"{item_id} — failed")
                if on_item_done:
                    on_item_done(config, items)

        if failed:
            info(f"⚠️ Config {config.name}: {len(failed)} item(s) failed: {failed}")


def _run_one_item(
    item,
    config,
    config_hash: str,
    run_kwargs: dict,
) -> None:
    """Run pipeline for a single item. Extracts original_text/cache_key from item (dict or object)."""
    raw = item.get("original_text") if isinstance(item, dict) else getattr(item, "original_text", None)
    ck = item.get("cache_key") if isinstance(item, dict) else getattr(item, "cache_key", None)
    raw_content = raw if raw else None
    cache_key = ck if (ck and not raw) else None
    run(
        raw_content,
        cache_key=cache_key,
        config=config,
        config_hash=config_hash,
        **run_kwargs,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Run full pipeline: script → chunker → images + voice → prepare → render."
    )
    parser.add_argument("content", nargs="?", help="Raw text content")
    parser.add_argument("-f", "--file", help="Path to file containing raw content")
    parser.add_argument(
        "-c",
        "--config",
        nargs="+",
        required=True,
        help="Config YAML path(s). Multiple configs run in sequence and write eval dataset.",
    )
    parser.add_argument(
        "-H",
        "--hash",
        metavar="CACHE_KEY",
        help="Run pipeline for existing cache. Starts from chunker. Requires -c.",
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
    parser.add_argument(
        "--break",
        dest="break_at",
        choices=["script", "chunker", "image", "voice", "prepare"],
        default=None,
        metavar="STEP",
        help="Stop after completing this step (script-only eval: --break script)",
    )
    parser.add_argument(
        "--prototype",
        action="store_true",
        help="Use cheap text-to-image (Replicate FLUX Schnell) + free readaloud TTS; no mascot, no ElevenLabs",
    )
    args = parser.parse_args()

    configs = [load_config(c) for c in args.config]

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
        cache_key = args.hash
        raw_content = None
        summary = ""
    elif not raw_content.strip():
        parser.print_help()
        error("Error: No content provided. Use -f file or -H CACHE_KEY.")
        sys.exit(1)
    else:
        cache_key = content_hash(raw_content)
        summary = raw_content

    title = Path(args.file).stem if args.file else "Untitled"
    items = [
        {
            "original_text": summary,
            "cache_key": cache_key,
            "id": cache_key,
            "title": title,
            "source_ref": None,
        }
    ]

    run_kwargs = dict(
        max_scenes=args.max_scenes,
        step=args.step,
        break_at=args.break_at,
        prototype=args.prototype,
    )

    try:
        run_batch(items, configs, concurrency=1, **run_kwargs)
        flush_traces_to_disk()
        print_batch_summary(items, configs)
        info("")
        eval_path = write_eval_dataset(configs=configs, nuggets=items)
        info(f"   📋 Eval dataset: {eval_path}")
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
