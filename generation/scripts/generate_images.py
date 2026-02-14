#!/usr/bin/env python3
"""
Generate mascot scene images from chunker JSON using Replicate img2img.
Called by run_pipeline. Outputs to cache/{cache_key}/images/.
"""

import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import urlopen

import requests
from dotenv import load_dotenv

from models import Chunks
from path_utils import env_path, mascot_path as default_mascot_path, cache_path
from logger import cache_stats_summary, error, info, progress, step_end, step_start, warn

load_dotenv(env_path())

REPLICATE_API = "https://api.replicate.com/v1"
GPT_MINI = "openai/gpt-image-1-mini"
NANO_BANANA_PRO = "google/nano-banana-pro"
REPLICATE_VERSION = GPT_MINI
PREDICT_URL = f"{REPLICATE_API}/predictions"

# Model → input params override (merged with common: image, prompt)
MODEL_INPUT_PARAMS: dict[str, dict[str, str]] = {
    GPT_MINI: {
        "aspect_ratio": "2:3",
    },
    NANO_BANANA_PRO: {
        "aspect_ratio": "9:16",
        "resolution": "1K",
    },
}
RETRY_DELAY = 5  # seconds between retries on 429
DEFAULT_INPUT_FIDELITY = "low"  # "low" = more scene/pose variation
DEFAULT_CONCURRENCY = 4  # parallel image generations (I/O-bound)

# Target output size and aspect ratio (9:16 = vertical/shorts)
OUTPUT_WIDTH = 540
OUTPUT_HEIGHT = 960
ASPECT_RATIO = "2:3"

STYLE_PROMPT = (
    "Hand-drawn stick figure style. Black line art. "
    "Character: round head, dot eyes, curved smile, thin black lines for body and limbs. "
    "Slightly uneven, sketchy linework like pen on paper. "
    "No background emphasis. Minimal or clean background. "
    "Motion lines (speed lines, curved dashes) around hands and objects to show movement when action is implied. "
    "Minimal hatching only, no gradients or color fill. Black outlines. "
    "A single accent color may be used to highlight a primary object (e.g., important prop, focal item) if it supports the scene. "
    "Use the reference for character design; place in the described scene with this hand-drawn sketch aesthetic."
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


def image_to_data_uri(path: Path) -> str:
    """Convert image file to base64 data URI for Replicate API."""
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    ext = path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{b64}"


def generate_image(
    mascot_path: Path,
    prompt: str,
    token: str,
    input_fidelity: str = DEFAULT_INPUT_FIDELITY,
    model: str = REPLICATE_VERSION,
) -> bytes:
    """Call Replicate img2img model via HTTP API. Returns image bytes."""
    image_uri = image_to_data_uri(mascot_path)
    model_params = dict(MODEL_INPUT_PARAMS.get(model, {}))
    inp: dict[str, str] = {
        "image": image_uri,
        "prompt": prompt,
        **model_params,
    }
    if model == "openai/gpt-image-1-mini":
        inp["input_fidelity"] = input_fidelity
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            inp["openai_api_key"] = openai_key
    payload = {"version": model, "input": inp}

    for attempt in range(10):
        resp = requests.post(
            PREDICT_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "wait=60",
            },
            json=payload,
            timeout=90,
        )
        if resp.status_code == 429 and attempt < 9:
            wait = RETRY_DELAY * (attempt + 1)
            warn(f"  Rate limited (429), retrying in {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()

        pred = resp.json()
        if pred.get("status") == "failed":
            err = pred.get("error", "Unknown error")
            raise RuntimeError(f"Replicate prediction failed: {err}")

        output = pred.get("output")
        if output is None:
            if attempt < 9:
                wait = RETRY_DELAY * (attempt + 1)
                warn(f"  No output from Replicate, retrying in {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError("No output from Replicate")

        # Output is typically a URL string for img2img
        url = output[0] if isinstance(output, list) else output
        if not isinstance(url, str) or not url.startswith("http"):
            raise RuntimeError(f"Unexpected output format: {output}")

        with urlopen(url) as r:
            return r.read()

def _generate_one(
    i: int,
    mascot: Path,
    full_prompt: str,
    token: str,
    input_fidelity: str,
    model: str,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one image. Returns (index, img_bytes, error_msg)."""
    try:
        img_bytes = generate_image(
            mascot, full_prompt, token, input_fidelity, model=model
        )
        return (i, img_bytes, None)
    except Exception as e:
        return (i, None, str(e))


def run(
    chunks: Chunks,
    cache_key: str,
    input_fidelity: str = DEFAULT_INPUT_FIDELITY,
    mascot_path: Path | None = None,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    model: str = REPLICATE_VERSION,
) -> Chunks:
    """
    Generate images from chunks. Uses per-image cache.
    cache_key = same as script/chunks. Output: cache/{cache_key}/images/image_1.png, etc.
    max_scenes: if set, only generate this many scenes (for testing).
    concurrency: number of parallel API calls (default 4).
    """
    images_dir = cache_path(cache_key, "images")
    mascot = mascot_path or default_mascot_path()
    if not mascot.exists():
        raise RuntimeError(f"Mascot not found at {mascot}")

    token = os.getenv("REPLICATE_API_TOKEN")
    if not token:
        raise RuntimeError("REPLICATE_API_TOKEN not found")

    scenes = chunks.scenes
    if not scenes:
        return chunks

    images_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    to_process = scenes[:max_scenes] if max_scenes is not None else scenes

    # Handle cached scenes and build work list for generation
    work: list[tuple[int, str, Path, str, Path]] = []  # (i, imagery, filename, full_prompt, request_path)
    cached_count = 0
    for i, scene in enumerate(to_process):
        imagery = scene.imagery
        if not imagery:
            continue

        filename = images_dir / f"image_{i + 1}.png"
        if skip_existing and filename.exists():
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
                _generate_one, i, mascot, full_prompt, token, input_fidelity, model
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
            progress(i + 1, total, f"saved -> {filename.name}")

            request_path.write_text(
                json.dumps(
                    {
                        "imagery": imagery,
                        "full_prompt": full_prompt,
                        "input_fidelity": input_fidelity,
                        "mascot": str(mascot),
                        "model": model,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    _update_chunks_json(cache_key, chunks, "image_path")
    step_end("Images", outputs=[images_dir], cache_hits=cached_count, cache_misses=len(work))
    return chunks
