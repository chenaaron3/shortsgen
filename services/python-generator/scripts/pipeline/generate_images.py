#!/usr/bin/env python3
"""
Generate mascot scene images from chunker JSON.
Uses image_generator layer for backend (gpt or replicate). All API/config logic is abstracted.
Called by run_pipeline. Outputs to cache/{cache_key}/images/.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

from image_generator import generate_image as generate_image_impl, get_config
from models import Chunks, Scene
from path_utils import env_path, mascot_path as default_mascot_path, video_cache_path
from logger import cache_stats_summary, error, progress, step_end, step_start
from usage_trace import record_image, set_context as usage_set_context

load_dotenv(env_path())

DEFAULT_CONCURRENCY = 10

STYLE_PROMPT = (
    "Hand-drawn stick figure style. Black line art on transparent background. "
    "Crisp, clean linework. Thin solid black outlines only. "
    "Flat style: no soft shading, no gradients, no airbrush, no gray smudges, no blotchy texture, no halftones. "
    "Optional: discrete hatching lines only where needed; never soft or blended shading. "
    "Motion lines (speed lines, curved dashes) around hands and objects when action is implied. "
    "Minimal or clean background. "
    "A single accent color may highlight one focal prop if it supports the scene. "
    "Use the reference for character design; place in the described scene. "
    "Result must look like crisp pen or chalk drawing, not rendered or shaded."
)

# Used when prototype=True (text-to-image only, no mascot reference image)
MASCOT_DESCRIPTION = (
    "A minimalist, cute, gender-neutral stick-figure mascot with a very large perfectly round head and a very small simple body underneath it. "
    "The design is extremely clean and iconic: white fill, bold smooth black outline, flat black-and-white 2D vector style, no shading, no texture, no sketch lines, no realism. "
    "The head is the defining feature: a near-perfect circle that takes up most of the character, making the mascot feel instantly recognizable and easy to read at a glance. "
    "The face is very simple and centered, with two large circular eyes, black pupils, tiny white highlights, and a tiny simple mouth that can change slightly for expression. "
    "The mascot always wears perfectly round eyeglasses with thin black rims; the glasses are symmetrical, sit low and centered on the face, and are the main identity trait of the character. "
    "The body is tiny, smooth, and understated compared to the head, with a narrow rounded torso and very simple proportions. "
    "The arms and legs are short, thin, rounded, and tube-like, like soft noodle limbs rather than realistic anatomy. "
    "The hands and feet are extremely simplified, with no visible fingers, no separated toes, and no detailed joints. "
    "The mascot has no hair, no eyebrows unless only minimally suggested for expression, no nose, no ears, no eyelashes, no clothing, no accessories other than the glasses, and NO TAIL. "
    "The silhouette should feel closer to a clean cartoon stick mascot than to a bean, plush toy, animal, ghost, or blob creature. "
    "The overall vibe is playful, wholesome, friendly, expressive, nerdy, and highly readable, with consistent simple proportions and a clean mascot-sheet appearance. "
)

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


def _build_chains(scenes: list[Scene], prototype: bool = False) -> list[list[int]]:
    """Build chains: [[0], [1,2], [3], ...]. Items in same list run in series; different lists run in parallel. When prototype, each scene is its own chain (max parallelism)."""
    if prototype:
        return [[i] for i in range(len(scenes))]
    chains: list[list[int]] = []
    current: list[int] = []
    for i, scene in enumerate(scenes):
        if getattr(scene, "transition_from_previous", False) and current:
            current.append(i)
        else:
            if current:
                chains.append(current)
            current = [i]
    if current:
        chains.append(current)
    return chains


PROTOTYPE_MODEL = "bytedance/hyper-flux-8step:16084e9731223a4367228928a6cb393b21736da2a0ca6a5a492ce311f0a97143"


def _generate_one(
    i: int,
    mascot: Path,
    full_prompt: str,
    model: str | None,
    *,
    source_image: Path | None = None,
    input_fidelity: str = "low",
    prototype: bool = False,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one image. When source_image is set, use it (transition); else use mascot. When prototype, use text-to-image only."""
    try:
        img_bytes = generate_image_impl(
            mascot_path=mascot,
            prompt=full_prompt,
            source_image=source_image,
            model=model,
            input_fidelity=input_fidelity,
            prototype=prototype,
        )
        return (i, img_bytes, None)
    except Exception as e:
        return (i, None, str(e))


def run(
    chunks: Chunks,
    cache_key: str,
    config_hash: str,
    mascot_path: Path | None = None,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    scene_indices: list[int] | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    model: str | None = None,
    skip_cache: bool = False,
    prototype: bool = False,
) -> Chunks:
    """
    Generate images from chunks. Uses per-image cache.
    Chains: [[1], [2], [3]] = all parallel; [[1, 2], [3], [4]] = 2 after 1, then 3 and 4 parallel.
    Output: cache/{config_hash}/videos/{cache_key}/images/image_1.png, etc.
    max_scenes: if set, only generate this many scenes (for testing).
    scene_indices: if set, only process these scene indices (0-based). Forces skip_cache for those.
    concurrency: max parallel chains (default 10).
    model: optional override for image generator (uses backend default if None).
    skip_cache: if True, regenerate all images even when cached (for --step image iteration).
    prototype: use cheap text-to-image only (no mascot, no img2img transitions).
    """
    images_dir = video_cache_path(cache_key, config_hash, "images_prototype" if prototype else "images")
    mascot = mascot_path or default_mascot_path()
    if not prototype and not mascot.exists():
        raise RuntimeError(f"Mascot not found at {mascot}")

    scenes = chunks.scenes
    if not scenes:
        return chunks

    images_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    to_process = scenes[:max_scenes] if max_scenes is not None else scenes
    only_indices = set(scene_indices) if scene_indices is not None else None
    effective_model = PROTOTYPE_MODEL if prototype else model
    config = get_config(model_override=effective_model)

    work: list[tuple[int, str, Path, str, Path, bool]] = []
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
            f"{MASCOT_DESCRIPTION}{imagery}. {STYLE_PROMPT}"
            if prototype
            else f"{imagery}. {STYLE_PROMPT}"
        )
        request_path = images_dir / f"image_{i + 1}_request.json"
        is_transition = getattr(scene, "transition_from_previous", False)
        work.append((i, imagery, filename, full_prompt, request_path, is_transition))

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

    work_by_idx = {i: (imagery, filename, full_prompt, request_path, is_transition) for i, imagery, filename, full_prompt, request_path, is_transition in work}
    chains = _build_chains(to_process, prototype=prototype)

    def _run_chain(chain: list[int]) -> None:
        """Run one chain sequentially. Siblings (other chains) run in parallel."""
        prev_path: Path | None = None
        for i in chain:
            if i not in work_by_idx:
                prev_path = images_dir / f"image_{i + 1}.png"
                continue
            imagery, filename, full_prompt, request_path, is_transition = work_by_idx[i]
            if prototype:
                source = None
                fidelity = "low"
            elif is_transition and prev_path is not None and prev_path.exists():
                source = prev_path
                fidelity = "low"
            else:
                source = None
                fidelity = "low"
            try:
                _, img_bytes, err = _generate_one(
                    i, mascot, full_prompt, effective_model, source_image=source, input_fidelity=fidelity, prototype=prototype
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
            request_path.write_text(
                json.dumps(
                    {
                        "imagery": imagery,
                        "full_prompt": full_prompt,
                        "source": "text-only" if prototype else (str(source) if source else str(mascot)),
                        **config,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            prev_path = filename

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
