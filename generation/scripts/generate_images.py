#!/usr/bin/env python3
"""
Generate mascot scene images from chunker JSON.
Uses image_generator layer for backend (gpt or replicate). All API/config logic is abstracted.
Called by run_pipeline. Outputs to cache/{cache_key}/images/.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

from image_generator import generate_image as generate_image_impl, get_config
from models import Chunks
from path_utils import env_path, mascot_path as default_mascot_path, cache_path
from logger import cache_stats_summary, error, progress, step_end, step_start
from usage_trace import record_image

load_dotenv(env_path())

DEFAULT_CONCURRENCY = 10

STYLE_PROMPT = (
    "Hand-drawn stick figure style. Black line art on transparentbackground. "
    "Crisp, clean linework. Thin solid black outlines only. "
    "Flat style: no soft shading, no gradients, no airbrush, no gray smudges, no blotchy texture, no halftones. "
    "Optional: discrete hatching lines only where needed; never soft or blended shading. "
    "Motion lines (speed lines, curved dashes) around hands and objects when action is implied. "
    "Minimal or clean background. "
    "A single accent color may highlight one focal prop if it supports the scene. "
    "Use the reference for character design; place in the described scene. "
    "Result must look like crisp pen or chalk drawing, not rendered or shaded."
)


def _update_chunks_json(cache_key: str, chunks: Chunks, field: str) -> None:
    """Read chunks.json, update only the given field, write back. Safe for parallel updates."""
    chunks_path = cache_path(cache_key, "chunks.json")
    data = json.loads(chunks_path.read_text(encoding="utf-8"))
    for i, scene in enumerate(chunks.scenes):
        if i < len(data["scenes"]):
            val = getattr(scene, field, None)
            if val is not None:
                data["scenes"][i][field] = val
    chunks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_chunks(path: Path) -> Chunks:
    """Load and validate chunker JSON."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        error(f"Error reading chunks: {e}")
        sys.exit(1)

    try:
        return Chunks.model_validate(data)
    except Exception as e:
        error(f"Error validating chunks: {e}")
        sys.exit(1)


def _generate_one(
    i: int,
    mascot: Path,
    full_prompt: str,
    model: str | None,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one image. Returns (index, img_bytes, error_msg)."""
    try:
        img_bytes = generate_image_impl(
            mascot_path=mascot,
            prompt=full_prompt,
            model=model,
        )
        return (i, img_bytes, None)
    except Exception as e:
        return (i, None, str(e))


def run(
    chunks: Chunks,
    cache_key: str,
    mascot_path: Path | None = None,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    model: str | None = None,
    skip_cache: bool = False,
) -> Chunks:
    """
    Generate images from chunks. Uses per-image cache.
    cache_key = same as script/chunks. Output: cache/{cache_key}/images/image_1.png, etc.
    max_scenes: if set, only generate this many scenes (for testing).
    concurrency: number of parallel API calls (default 4).
    model: optional override for image generator (uses backend default if None).
    skip_cache: if True, regenerate all images even when cached (for --step image iteration).
    """
    images_dir = cache_path(cache_key, "images")
    mascot = mascot_path or default_mascot_path()
    if not mascot.exists():
        raise RuntimeError(f"Mascot not found at {mascot}")

    scenes = chunks.scenes
    if not scenes:
        return chunks

    images_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    to_process = scenes[:max_scenes] if max_scenes is not None else scenes
    config = get_config(model_override=model)

    work: list[tuple[int, str, Path, str, Path]] = []
    cached_count = 0
    for i, scene in enumerate(to_process):
        imagery = scene.imagery
        if not imagery:
            continue

        filename = images_dir / f"image_{i + 1}.png"
        if not skip_cache and skip_existing and filename.exists():
            scene.image_path = str(filename)
            cached_count += 1
            continue

        full_prompt = f"{imagery}. {STYLE_PROMPT}"
        request_path = images_dir / f"image_{i + 1}_request.json"
        work.append((i, imagery, filename, full_prompt, request_path))

    step_start("Images")
    extra = f"max={max_scenes}" if max_scenes else ""
    cache_stats_summary(cached_count, len(work), len(work), extra)

    if not work:
        _update_chunks_json(cache_key, chunks, "image_path")
        step_end("Images", outputs=[images_dir], cache_hits=cached_count, cache_misses=0)
        return chunks

    workers = min(concurrency, len(work))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                _generate_one,
                i,
                mascot,
                full_prompt,
                model,
            ): (i, imagery, filename, full_prompt, request_path)
            for i, imagery, filename, full_prompt, request_path in work
        }

        for future in as_completed(futures):
            i, imagery, filename, full_prompt, request_path = futures[future]
            try:
                idx, img_bytes, err = future.result()
            except Exception as e:
                progress(i + 1, total, f"failed: {e}")
                continue

            if err:
                progress(i + 1, total, f"failed: {err}")
                continue

            assert img_bytes is not None
            filename.write_bytes(img_bytes)
            to_process[i].image_path = str(filename)
            record_image("Images", config["model"], 1)
            progress(i + 1, total, f"saved -> {filename.name}")

            request_path.write_text(
                json.dumps(
                    {
                        "imagery": imagery,
                        "full_prompt": full_prompt,
                        "mascot": str(mascot),
                        **config,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    _update_chunks_json(cache_key, chunks, "image_path")
    step_end("Images", outputs=[images_dir], cache_hits=cached_count, cache_misses=len(work))
    return chunks
