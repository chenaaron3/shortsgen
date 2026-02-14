#!/usr/bin/env python3
"""
Generate TTS voice for each scene from chunker JSON using ElevenLabs Python SDK.
Called by run_pipeline. Outputs to cache/{cache_key}/voice/.
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

from models import Chunks
from path_utils import env_path, cache_path
from logger import cache_stats_summary, error, info, progress, step_end, step_start, warn

load_dotenv(env_path())

DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # Adam
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_CONCURRENCY = 1  # ElevenLabs rate limits; increase with higher tiers


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


def generate_voice(
    client: ElevenLabs,
    text: str,
    voice_id: str,
    model_id: str = DEFAULT_MODEL_ID,
    output_format: str = DEFAULT_OUTPUT_FORMAT,
) -> bytes:
    """Call ElevenLabs text-to-speech via SDK. Returns audio bytes."""
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id=model_id,
        output_format=output_format,
    )
    # SDK returns a generator of bytes chunks; join them
    if hasattr(audio, "__iter__") and not isinstance(audio, (bytes, bytearray)):
        return b"".join(audio)
    return bytes(audio) if not isinstance(audio, bytes) else audio


def _generate_one(
    i: int,
    client: ElevenLabs,
    text: str,
    voice_id: str,
    model_id: str,
    output_format: str,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one voice. Returns (index, audio_bytes, error_msg)."""
    try:
        audio_bytes = generate_voice(
            client,
            text,
            voice_id,
            model_id=model_id,
            output_format=output_format,
        )
        return (i, audio_bytes, None)
    except Exception as e:
        err_msg = str(e)
        if "401" in err_msg or "Unauthorized" in err_msg:
            err_msg = (
                "ElevenLabs 401 Unauthorized: API key invalid or expired. "
                "Get a fresh key from https://elevenlabs.io/app/settings/api-keys"
            )
        return (i, None, err_msg)


def run(
    chunks: Chunks,
    cache_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL_ID,
    output_format: str = DEFAULT_OUTPUT_FORMAT,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> Chunks:
    """
    Generate voice for each scene. Uses per-scene cache.
    Output: cache/{cache_key}/voice/voice_1.mp3, etc.
    """
    voice_dir = cache_path(cache_key, "voice")

    api_key = (
        os.getenv("ELEVENLABS_API_KEY") or os.getenv("XI_API_KEY") or ""
    ).strip()
    if not api_key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY (or XI_API_KEY) not found. "
            "Add it to .env or get a key from https://elevenlabs.io/app/settings/api-keys"
        )

    client = ElevenLabs(api_key=api_key)

    scenes = chunks.scenes
    if not scenes:
        step_start("Voice")
        info("  No scenes to process")
        step_end("Voice", cache_hits=0, cache_misses=0)
        return chunks

    voice_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    to_process = scenes[:max_scenes] if max_scenes is not None else scenes
    extra = f"max={max_scenes}" if max_scenes else ""

    work: list[tuple[int, str, Path]] = []
    cached_count = 0
    skipped_empty = 0
    for i, scene in enumerate(to_process):
        text = scene.text.strip()
        if not text:
            skipped_empty += 1
            continue

        filename = voice_dir / f"voice_{i + 1}.mp3"
        if skip_existing and filename.exists():
            scene.voice_path = str(filename)
            cached_count += 1
            continue

        work.append((i, text, filename))

    step_start("Voice")
    cache_stats_summary(cached_count, len(work), len(work), extra)
    if skipped_empty:
        warn(f"  Skipped {skipped_empty} scene(s) with empty text")

    if not work:
        _update_chunks_json(cache_key, chunks, "voice_path")
        step_end("Voice", outputs=[voice_dir], cache_hits=cached_count, cache_misses=0)
        return chunks

    workers = min(concurrency, len(work))
    failed_count = 0
    generated_count = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                _generate_one,
                i,
                client,
                text,
                voice_id,
                model_id,
                output_format,
            ): (i, text, filename)
            for i, text, filename in work
        }

        for future in as_completed(futures):
            i, text, filename = futures[future]
            try:
                idx, audio_bytes, err = future.result()
            except Exception as e:
                failed_count += 1
                progress(i + 1, total, f"failed: {e}")
                continue

            if err:
                failed_count += 1
                progress(i + 1, total, f"failed: {err}")
                continue

            assert audio_bytes is not None
            filename.write_bytes(audio_bytes)
            to_process[i].voice_path = str(filename)
            generated_count += 1
            text_preview = (text[:40] + "…") if len(text) > 40 else text
            progress(i + 1, total, f"saved -> {filename.name} ({len(audio_bytes)} bytes) \"{text_preview}\"")

    _update_chunks_json(cache_key, chunks, "voice_path")

    step_end(
        "Voice",
        outputs=[voice_dir],
        cache_hits=cached_count,
        cache_misses=generated_count + failed_count,
    )
    if failed_count:
        warn(f"  {failed_count} generation(s) failed")
    return chunks
