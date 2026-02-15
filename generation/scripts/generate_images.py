#!/usr/bin/env python3
"""
Generate mascot scene images from chunker JSON using OpenAI images/edits (img2img).
Called by run_pipeline. Outputs to cache/{cache_key}/images/.
"""

import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from dotenv import load_dotenv

from models import Chunks
from path_utils import env_path, mascot_path as default_mascot_path, cache_path
from logger import cache_stats_summary, error, info, progress, step_end, step_start, warn

load_dotenv(env_path())

GPT_IMAGE_MINI = "gpt-image-1-mini"
GPT_IMAGE_1 = "gpt-image-1"
GPT_IMAGE_15 = "gpt-image-1.5"
DEFAULT_MODEL = GPT_IMAGE_MINI

# Model → size override (must be valid API sizes: 1024x1024, 1536x1024, 1024x1536, auto)
MODEL_SIZE: dict[str, str] = {
    GPT_IMAGE_MINI: "1024x1536",
    GPT_IMAGE_1: "1024x1536",
    GPT_IMAGE_15: "1024x1536",
}
RETRY_DELAY = 5  # seconds between retries on 429
DEFAULT_INPUT_FIDELITY = "low"  # "low" = more scene/pose variation
DEFAULT_CONCURRENCY = 4  # parallel image generations (I/O-bound)

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
    """Convert image file to base64 data URI for OpenAI images/edits API."""
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    ext = path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{b64}"


def generate_image(
    mascot_path: Path,
    prompt: str,
    api_key: str,
    input_fidelity: str = DEFAULT_INPUT_FIDELITY,
    model: str = DEFAULT_MODEL,
) -> bytes:
    """Call OpenAI images/edits API (img2img) via JSON. SDK uses multipart which only supports dall-e-2."""
    image_uri = image_to_data_uri(mascot_path)
    size = MODEL_SIZE.get(model, "1024x1536")

    payload = {
        "images": [{"image_url": image_uri}],
        "prompt": prompt,
        "model": model,
        "size": size,
        "quality": "low",
        "output_format": "png",
        "n": 1,
    }
    if model != GPT_IMAGE_MINI:
        payload["input_fidelity"] = input_fidelity

    for attempt in range(10):
        try:
            req = Request(
                "https://api.openai.com/v1/images/edits",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode())
        except HTTPError as e:
            body = ""
            if e.fp:
                try:
                    body = e.fp.read().decode()
                except Exception:
                    pass
            if e.code == 429 and attempt < 9:
                wait = RETRY_DELAY * (attempt + 1)
                warn(f"  Rate limited (429), retrying in {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"OpenAI API error {e.code}: {body or str(e)}") from e

        data = result.get("data")
        if not data:
            if attempt < 9:
                wait = RETRY_DELAY * (attempt + 1)
                warn(f"  No output from OpenAI, retrying in {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError("No output from OpenAI images/edits")

        b64_data = data[0].get("b64_json")
        if not b64_data:
            raise RuntimeError("OpenAI returned no base64 image data")

        return base64.b64decode(b64_data)

def _generate_one(
    i: int,
    mascot: Path,
    full_prompt: str,
    api_key: str,
    input_fidelity: str,
    model: str,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one image. Returns (index, img_bytes, error_msg)."""
    try:
        img_bytes = generate_image(
            mascot, full_prompt, api_key, input_fidelity, model=model
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
    model: str = DEFAULT_MODEL,
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

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found")

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
                _generate_one, i, mascot, full_prompt, api_key, input_fidelity, model
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
