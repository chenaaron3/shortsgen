#!/usr/bin/env python3
"""
Generate TTS voice for each scene from chunker JSON using ElevenLabs Python SDK.
Called by run_pipeline. Outputs to cache/{cache_key}/voice/.
"""

import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.types import VoiceSettings

from models import Chunks
from path_utils import env_path, cache_path
from logger import cache_stats_summary, error, info, progress, step_end, step_start, warn
from usage_trace import record_voice

load_dotenv(env_path())

DEFAULT_VOICE_ID = "j98abMrE0ALhypC19Bnz"  # https://elevenlabs.io/app/voice-library?voiceId=j98abMrE0ALhypC19Bnz
DEFAULT_MODEL_ID = "eleven_multilingual_v2"  # For request stitching (previous_text/next_text), use eleven_multilingual_v2
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_CONCURRENCY = 1  # only use one

# Voice settings for more realistic shorts (lively, expressive)
DEFAULT_STABILITY = 0.5
DEFAULT_SIMILARITY_BOOST = 0.9
DEFAULT_USE_SPEAKER_BOOST = True
DEFAULT_STYLE = 0.1


def _seed_from_cache_key(cache_key: str) -> int:
    """Deterministic seed (0–4294967295) for consistent voice across clips."""
    h = hashlib.sha256(cache_key.encode()).hexdigest()[:8]
    return int(h, 16) % 4294967296


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


def _voice_settings_from_env() -> VoiceSettings:
    """Build VoiceSettings from env vars with defaults for shorts."""
    def _float(key: str, default: float) -> float:
        val = os.getenv(key)
        if val is None:
            return default
        try:
            return float(val)
        except ValueError:
            return default

    def _bool(key: str, default: bool) -> bool:
        val = os.getenv(key, "").strip().lower()
        if val in ("1", "true", "yes"):
            return True
        if val in ("0", "false", "no"):
            return False
        return default

    return VoiceSettings(
        stability=_float("ELEVENLABS_STABILITY", DEFAULT_STABILITY),
        similarity_boost=_float("ELEVENLABS_SIMILARITY_BOOST", DEFAULT_SIMILARITY_BOOST),
        use_speaker_boost=_bool("ELEVENLABS_USE_SPEAKER_BOOST", DEFAULT_USE_SPEAKER_BOOST),
        style=_float("ELEVENLABS_STYLE", DEFAULT_STYLE),
    )


# eleven_v3 does not support request stitching (previous_text, next_text)
MODELS_WITH_STITCHING = ("eleven_multilingual_v2", "eleven_turbo_v2", "eleven_turbo_v2_5")


def generate_voice(
    client: ElevenLabs,
    text: str,
    voice_id: str,
    model_id: str = DEFAULT_MODEL_ID,
    output_format: str = DEFAULT_OUTPUT_FORMAT,
    voice_settings: VoiceSettings | None = None,
    *,
    previous_text: str | None = None,
    next_text: str | None = None,
    seed: int | None = None,
) -> bytes:
    """Call ElevenLabs text-to-speech via SDK. Returns audio bytes.
    previous_text and next_text improve continuity when stitching clips (not supported by eleven_v3).
    seed reduces randomness for consistent voice across clips."""
    if voice_settings is None:
        voice_settings = _voice_settings_from_env()

    # Continuity params for consistent voice across clips
    kwargs: dict = {
        "voice_id": voice_id,
        "text": text,
        "model_id": model_id,
        "output_format": output_format,
        "voice_settings": voice_settings,
    }
    # Request stitching only supported by some models (e.g. eleven_multilingual_v2)
    if model_id in MODELS_WITH_STITCHING:
        if previous_text:
            kwargs["previous_text"] = previous_text
        if next_text:
            kwargs["next_text"] = next_text
    if seed is not None:
        kwargs["seed"] = seed

    # Use raw response when available to get x-character-count for usage tracking
    raw_client = getattr(client.text_to_speech, "with_raw_response", None)
    if raw_client is not None:
        # raw_client.convert is a context manager; must use "with" to enter it
        with raw_client.convert(**kwargs) as resp:
            chars_header = getattr(resp, "headers", {}).get("x-character-count") if hasattr(resp, "headers") else None
            if chars_header is not None:
                try:
                    record_voice("Voice", model_id, int(chars_header))
                except (TypeError, ValueError):
                    record_voice("Voice", model_id, len(text))
            else:
                record_voice("Voice", model_id, len(text))
            audio_stream = getattr(resp, "data", None)
            if audio_stream is not None:
                return b"".join(audio_stream)
            return b""
    else:
        audio = client.text_to_speech.convert(**kwargs)
        record_voice("Voice", model_id, len(text))

    # SDK returns an iterator of bytes chunks; join them
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
    voice_settings: VoiceSettings,
    *,
    previous_text: str | None = None,
    next_text: str | None = None,
    seed: int | None = None,
) -> tuple[int, bytes | None, str | None]:
    """Worker: generate one voice. Returns (index, audio_bytes, error_msg)."""
    try:
        audio_bytes = generate_voice(
            client,
            text,
            voice_id,
            model_id=model_id,
            output_format=output_format,
            voice_settings=voice_settings,
            previous_text=previous_text,
            next_text=next_text,
            seed=seed,
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
    voice_id: str | None = None,
    model_id: str | None = None,
    output_format: str = DEFAULT_OUTPUT_FORMAT,
    skip_existing: bool = True,
    max_scenes: int | None = None,
    concurrency: int | None = None,
    skip_cache: bool = False,
) -> Chunks:
    """
    Generate voice for each scene. Uses per-scene cache.
    Output: cache/{cache_key}/voice/voice_1.mp3, etc.
    skip_cache: if True, regenerate all voice even when cached (for --step 3 iteration).
    voice_id, model_id, concurrency default from env (ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID, ELEVENLABS_CONCURRENCY).
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

    if voice_id is None:
        voice_id = (os.getenv("ELEVENLABS_VOICE_ID") or "").strip() or DEFAULT_VOICE_ID
    if model_id is None:
        model_id = (os.getenv("ELEVENLABS_MODEL_ID") or "").strip() or DEFAULT_MODEL_ID
    if concurrency is None:
        val = os.getenv("ELEVENLABS_CONCURRENCY")
        concurrency = int(val) if (val and val.strip().isdigit()) else DEFAULT_CONCURRENCY

    voice_settings = _voice_settings_from_env()
    client = ElevenLabs(api_key=api_key)
    seed_val = (os.getenv("ELEVENLABS_SEED") or "").strip()
    if seed_val.isdigit():
        seed = int(seed_val) % 4294967296
    else:
        seed = _seed_from_cache_key(cache_key)

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

    work: list[tuple[int, str, Path, str | None, str | None]] = []
    cached_count = 0
    skipped_empty = 0
    texts = [s.text.strip() for s in to_process]
    for i, scene in enumerate(to_process):
        text = texts[i]
        if not text:
            skipped_empty += 1
            continue

        filename = voice_dir / f"voice_{i + 1}.mp3"
        if not skip_cache and skip_existing and filename.exists():
            scene.voice_path = str(filename)
            cached_count += 1
            continue

        prev = (texts[i - 1] or None) if i > 0 else None
        nxt = (texts[i + 1] or None) if i + 1 < len(texts) else None
        work.append((i, text, filename, prev, nxt))

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
                voice_settings,
                previous_text=prev,
                next_text=nxt,
                seed=seed,
            ): (i, text, filename)
            for i, text, filename, prev, nxt in work
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
