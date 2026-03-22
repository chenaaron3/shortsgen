#!/usr/bin/env python3
"""
Generate TTS voice from chunker JSON. Uses voice_generator (ElevenLabs, readaloud, or ttsvibes).
Outputs to cache/{config_hash}/videos/{cache_key}/voice/voice_1.mp3, etc.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from models import Chunks
from path_utils import env_path, video_cache_path
from logger import cache_stats_summary, error, info, progress, step_end, step_start
from voice_generator import generate_for_scenes, get_backend

load_dotenv(env_path())


def _update_chunks_json(cache_key: str, config_hash: str, chunks: Chunks, field: str) -> None:
    chunks_path = video_cache_path(cache_key, config_hash, "chunks.json")
    data = json.loads(chunks_path.read_text(encoding="utf-8"))
    for i, scene in enumerate(chunks.scenes):
        if i < len(data["scenes"]):
            val = getattr(scene, field, None)
            if val is not None:
                data["scenes"][i][field] = val
    chunks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def run(
    chunks: Chunks,
    cache_key: str,
    config_hash: str,
    voice_id: str | None = None,
    model_id: str | None = None,
    output_format: str = "mp3_44100_128",
    skip_existing: bool = True,
    max_scenes: int | None = None,
    skip_cache: bool = False,
    whisper_model: str = "base.en",
    voice_backend: str | None = None,
) -> Chunks:
    """
    Generate voice via voice_generator (ElevenLabs, readaloud, or ttsvibes).
    Output: cache/{config_hash}/videos/{cache_key}/voice/voice_1.mp3
    voice_backend: from config.voice.backend; if absent, defaults to elevenlabs.
    """
    voice_dir = video_cache_path(cache_key, config_hash, "voice")

    scenes = chunks.scenes
    if max_scenes is not None:
        scenes = scenes[:max_scenes]
    if not scenes:
        step_start("Voice")
        info("  No scenes to process")
        step_end("Voice", cache_hits=0, cache_misses=0)
        return chunks

    texts = [s.text.strip() for s in scenes]
    if not any(t for t in texts):
        step_start("Voice")
        info("  No text to speak")
        step_end("Voice", cache_hits=0, cache_misses=0)
        return chunks

    voice_dir.mkdir(parents=True, exist_ok=True)
    all_cached = (
        skip_existing
        and not skip_cache
        and all((voice_dir / f"voice_{i+1}.mp3").exists() for i in range(len(scenes)))
    )
    if all_cached:
        step_start("Voice")
        for i, scene in enumerate(scenes):
            scene.voice_path = str(voice_dir / f"voice_{i+1}.mp3")
        _update_chunks_json(cache_key, config_hash, chunks, "voice_path")
        cache_stats_summary(len(scenes), 0, 0, f"max={max_scenes}" if max_scenes else "")
        step_end("Voice", outputs=[voice_dir], cache_hits=len(scenes), cache_misses=0)
        return chunks

    step_start("Voice")
    extra = f"max={max_scenes}" if max_scenes else ""
    cache_stats_summary(0, len(scenes), len(scenes), extra)

    backend = get_backend(voice_backend)
    if backend == "elevenlabs":
        info("  Generating full script with eleven_v3 (single call for continuity)...")
    else:
        info(f"  Generating with {backend} (free TTS, one call per scene)...")

    try:
        clips = generate_for_scenes(
            scenes,
            cache_key=cache_key,
            voice_backend=voice_backend,
            whisper_model=whisper_model,
            temp_dir=voice_dir,
        )
    except Exception as e:
        error(str(e))
        raise

    for i, (scene, clip_bytes) in enumerate(zip(scenes, clips)):
        path = voice_dir / f"voice_{i+1}.mp3"
        path.write_bytes(clip_bytes)
        scene.voice_path = str(path)
        preview = (scene.text[:40] + "…") if len(scene.text) > 40 else scene.text
        progress(i + 1, len(scenes), f"saved -> {path.name} \"{preview}\"")

    _update_chunks_json(cache_key, config_hash, chunks, "voice_path")
    step_end("Voice", outputs=[voice_dir], cache_hits=0, cache_misses=len(scenes))
    return chunks
