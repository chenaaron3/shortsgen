#!/usr/bin/env python3
"""
Generate mascot scene images from chunker JSON.
Uses image_generator layer for backend (gpt or replicate). All API/config logic is abstracted.
Called by run_pipeline. Outputs to cache/{cache_key}/images/.
"""

import json
import sys
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

from image_generator import generate_image as generate_image_impl, get_config
from models import Chunks, Scene
from path_utils import env_path, mascot_path as default_mascot_path, video_cache_path
from pipeline.image_style_defaults import effective_prompts_for_pipeline
from logger import cache_stats_summary, error, progress, step_end, step_start
from usage_trace import record_image, set_context as usage_set_context

load_dotenv(env_path())

DEFAULT_CONCURRENCY = 10


def _update_chunks_json(
    cache_key: str,
    config_hash: str,
    chunks: Chunks,
    field: str,
    *,
    only_scene_indices: set[int] | None = None,
) -> None:
    """Read chunks.json, update only the given field, write back. Safe for parallel updates.
    When only_scene_indices is set, only update those scenes (preserves others)."""
    chunks_path = video_cache_path(cache_key, config_hash, "chunks.json")
    data = json.loads(chunks_path.read_text(encoding="utf-8"))
    for i, scene in enumerate(chunks.scenes):
        if only_scene_indices is not None and i not in only_scene_indices:
            continue
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


def _is_text_to_image_only(model: str | None) -> bool:
    """True when model uses text-to-image only (no mascot, no img2img)."""
    return bool(model and "hyper-flux" in model)


def _build_chains(scenes: list[Scene]) -> list[list[int]]:
    """Build chains: each scene is its own chain (max parallelism)."""
    return [[i] for i in range(len(scenes))]


def _generate_one(
    i: int,
    mascot: Path,
    full_prompt: str,
    model: str | None,
    *,
    source_image: Path | None = None,
    input_fidelity: str = "low",
    text_to_image_only: bool = False,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one image. When source_image is set, use it (transition); else use mascot. When text_to_image_only, use text-to-image only."""
    try:
        img_bytes = generate_image_impl(
            mascot_path=mascot,
            prompt=full_prompt,
            source_image=source_image,
            model=model,
            input_fidelity=input_fidelity,
            text_to_image_only=text_to_image_only,
        )
        return (i, img_bytes, None)
    except Exception as e:
        return (i, None, str(e))


def run(
    chunks: Chunks,
    cache_key: str,
    config_hash: str,
    mascot_path: Path | None = None,
    *,
    style_prompt: str | None = None,
    mascot_description: str | None = None,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    scene_indices: list[int] | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    model: str | None = None,
    skip_cache: bool = False,
    on_image_complete: Callable[[int, int, str | None], None] | None = None,
) -> Chunks:
    """
    Generate images from chunks. Uses per-image cache.
    Chains: [[1], [2], [3]] = all parallel; [[1, 2], [3], [4]] = 2 after 1, then 3 and 4 parallel.
    Output: cache/{config_hash}/videos/{cache_key}/images/image_1.png, etc.
    max_scenes: if set, only generate this many scenes (for testing).
    scene_indices: if set, only process these scene indices (0-based). Forces skip_cache for those.
    concurrency: max parallel chains (default 10).
    model: image model from config (e.g. hyper-flux for text-to-image only). Uses backend default if None.
    skip_cache: if True, regenerate all images even when cached (for --step image iteration).
    on_image_complete: optional callback(done_count, total) invoked after each image is generated.
    style_prompt: override global style suffix; None uses defaults from image_style_defaults (local CLI).
    mascot_description: override text-only mascot lead-in; None uses defaults. Brand path passes resolved strings from brand_resolve.
    """
    images_dir = video_cache_path(cache_key, config_hash, "images")
    mascot = mascot_path or default_mascot_path()
    effective_style, effective_mascot_desc = effective_prompts_for_pipeline(style_prompt, mascot_description)
    text_to_image_only = _is_text_to_image_only(model)
    if not text_to_image_only and not mascot.exists():
        raise RuntimeError(f"Mascot not found at {mascot}")

    scenes = chunks.scenes
    if not scenes:
        return chunks

    images_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    to_process = scenes[:max_scenes] if max_scenes is not None else scenes
    only_indices = set(scene_indices) if scene_indices is not None else None
    effective_model = model
    config = get_config(model_override=effective_model)

    work: list[tuple[int, str, Path, str, Path]] = []
    cached_count = 0
    for i, scene in enumerate(to_process):
        if only_indices is not None and i not in only_indices:
            continue
        imagery = scene.imagery
        if not imagery:
            continue

        filename = images_dir / f"image_{i + 1}.png"
        force_regenerate = only_indices is not None and i in only_indices
        if not skip_cache and not force_regenerate and skip_existing and filename.exists():
            scene.image_path = str(filename)
            cached_count += 1
            continue

        full_prompt = (
            f"{effective_mascot_desc}{imagery}. {effective_style}"
            if text_to_image_only
            else f"{imagery}. {effective_style}"
        )
        request_path = images_dir / f"image_{i + 1}_request.json"
        work.append((i, imagery, filename, full_prompt, request_path))

    step_start("Images")
    extra = f"max={max_scenes}" if max_scenes else ""
    cache_stats_summary(cached_count, len(work), len(work), extra)

    if not work:
        _update_chunks_json(
            cache_key,
            config_hash,
            chunks,
            "image_path",
            only_scene_indices=only_indices,
        )
        step_end("Images", outputs=[images_dir], cache_hits=cached_count, cache_misses=0)
        return chunks

    work_by_idx = {i: (imagery, filename, full_prompt, request_path) for i, imagery, filename, full_prompt, request_path in work}
    chains = _build_chains(to_process)
    images_done_lock = threading.Lock()
    images_done = [0]  # mutable for closure

    def _run_chain(chain: list[int]) -> None:
        """Run one chain sequentially. Siblings (other chains) run in parallel."""
        for i in chain:
            if i not in work_by_idx:
                continue
            imagery, filename, full_prompt, request_path = work_by_idx[i]
            source = None
            fidelity = "low"
            try:
                _, img_bytes, err = _generate_one(
                    i, mascot, full_prompt, effective_model, source_image=source, input_fidelity=fidelity, text_to_image_only=text_to_image_only
                )
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
            if on_image_complete:
                with images_done_lock:
                    images_done[0] += 1
                    done = images_done[0]
                on_image_complete(done, total, str(filename))
            request_path.write_text(
                json.dumps(
                    {
                        "imagery": imagery,
                        "full_prompt": full_prompt,
                        "source": "text-only" if text_to_image_only else (str(source) if source else str(mascot)),
                        **config,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    chains_with_work = [c for c in chains if any(i in work_by_idx for i in c)]
    if len(chains_with_work) == 1 and len(chains_with_work[0]) == 1:
        _run_chain(chains_with_work[0])
    else:
        # Workers don't inherit contextvars; set usage key in each worker (Context.run can't be shared across threads)
        def _run_chain_with_ctx(chain):
            usage_set_context(cache_key, config_hash, clear=False)
            _run_chain(chain)

        with ThreadPoolExecutor(max_workers=min(concurrency, len(chains_with_work))) as executor:
            list(executor.map(_run_chain_with_ctx, chains_with_work))

    _update_chunks_json(
        cache_key,
        config_hash,
        chunks,
        "image_path",
        only_scene_indices=only_indices,
    )
    step_end("Images", outputs=[images_dir], cache_hits=cached_count, cache_misses=len(work))
    return chunks
