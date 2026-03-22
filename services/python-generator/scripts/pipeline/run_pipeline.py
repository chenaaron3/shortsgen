#!/usr/bin/env python3
"""
Orchestrate the full pipeline: script → chunker → (images + voice) → prepare → render.

Calls into each module's run() function. Each layer handles its own caching.
Image and voice generation run concurrently after chunking.
Used by run_source_pipeline (single content: use run_source_pipeline -f file -c config --no-breakdown).
"""

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
from models import Chunks
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
    chunks: Chunks | None = None,
    config,
    config_hash: str,
    max_scenes: int | None = None,
    step: str | None = None,
    break_at: str | None = None,
    prototype: bool = False,
    on_step_complete: Callable[[str], None] | None = None,
) -> Path | None:
    """
    Run the full pipeline for raw content, an existing cache, or in-memory chunks.

    Args:
        raw_content: Raw text to turn into a short video. Not required when chunks is provided.
        cache_key: Use this cache key instead of computing from content. Required when chunks is provided.
        chunks: In-memory chunks; skip script and chunker, start at images. Writes chunks.json to cache.
        config: Pipeline config (from config_loader).
        config_hash: Hash of config for cache paths.
        max_scenes: Only generate first N scenes (for testing).
        step: Invalidate cache for STEP and all subsequent steps, then run full pipeline.
        break_at: Stop after completing this step (script, chunker, image, prepare, video).
                  image covers both image and voice phase.
        prototype: Use cheap text-to-image only (Replicate FLUX Schnell); no mascot, no img2img transitions.
        on_step_complete: Optional callback invoked when a step finishes. Step names: "script", "chunker", "image", "voice", "caption".

    Returns:
        Path to output video when full pipeline completes, else None.
    """
    chunks_mode = chunks is not None

    if chunks_mode:
        if not cache_key:
            error("cache_key required when chunks is provided.")
            raise ValueError("cache_key required when chunks is provided")
        if step == "script" or step == "chunker":
            error("Cannot run step 'script' or 'chunker' when chunks is provided.")
            raise ValueError("chunks mode cannot run script or chunker steps")
    else:
        if not raw_content or not raw_content.strip():
            error("No content provided. Use -f file.")
            raise ValueError("No content provided")
        cache_key = content_hash(raw_content)
    if cache_key is None:
        raise ValueError("cache_key required")
    info(f"🔑 cache_key: {cache_key} | config: {config.name}")

    usage_set_context(cache_key, config_hash)
    invalidate_steps = _steps_from(step) if step else frozenset()
    if invalidate_steps:
        info(f"  Invalidating cache for: {', '.join(sorted(invalidate_steps))}")

    if chunks_mode:
        info("  Chunks mode: starting from images (using in-memory chunks)")
        cache_dir = video_cache_path(cache_key, config_hash)
        cache_dir.mkdir(parents=True, exist_ok=True)
        (cache_dir / "chunks.json").write_text(chunks.model_dump_json(indent=2), encoding="utf-8")
    if prototype:
        info("  Prototype mode: cheap text-to-image (no mascot) + free readaloud TTS")

    if not chunks_mode:
        set_step_context(1, 6)
        assert raw_content is not None  # validated above
        script = run_script(raw_content, cache_key, config, config_hash, skip_cache="script" in invalidate_steps)
        if on_step_complete:
            on_step_complete("script")

        if break_at == "script":
            _finish_partial(cache_key, config_hash)
            return None

        set_step_context(2, 6)
        chunks = run_chunker(script, cache_key, config, config_hash, skip_cache="chunker" in invalidate_steps)
        if on_step_complete:
            on_step_complete("chunker")

        if break_at == "chunker":
            _finish_partial(cache_key, config_hash)
            return None

    assert chunks is not None  # chunks_mode or assigned from run_chunker above
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
        step_by_future = {future_images: "image", future_voice: "voice"}
        for future in as_completed(step_by_future):
            future.result()
            if on_step_complete and future in step_by_future:
                on_step_complete(step_by_future[future])

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
            whisper_model="base",
            skip_cache="prepare" in invalidate_steps,
        )
        if on_step_complete:
            on_step_complete("prepare")
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
    Run the pipeline for each (item, config) pair. Items need .original_text.
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
    """Run pipeline for a single item. Extracts original_text from item (dict or object)."""
    raw = item.get("original_text") if isinstance(item, dict) else getattr(item, "original_text", None)
    raw_content = raw if raw else None
    if not raw_content or not raw_content.strip():
        error("Item missing original_text.")
        raise ValueError("Item missing original_text")
    run(
        raw_content,
        config=config,
        config_hash=config_hash,
        **run_kwargs,
    )


