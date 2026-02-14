#!/usr/bin/env python3
"""
Prepare cache assets for Remotion: copy to public/ and create manifest.
Called by run_pipeline. Outputs to public/shortgen/{cache_key}/manifest.json.
"""

import json
import shutil
import sys
from pathlib import Path

# Optional: mutagen for MP3 duration (pip install mutagen)
try:
    from mutagen.mp3 import MP3
except ImportError:
    MP3 = None

# Optional: faster-whisper for word-level transcription
try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


from path_utils import cache_path, video_public
from logger import error, info, step_end, step_start, warn


def get_audio_duration_seconds(path: Path) -> float:
    """Get audio duration in seconds. Uses mutagen if available, else estimates."""
    if MP3 is not None:
        try:
            audio = MP3(path)
            return float(audio.info.length)
        except Exception:
            pass
    return 3.0



def transcribe_audio_with_whisper(
    voice_paths: list[Path], output_captions: list[dict], model_size: str = "base.en"
) -> None:
    """
    Transcribe each voice file with Whisper and append word-level captions.
    Offsets each file's timestamps by the cumulative duration of prior files.
    """
    if WhisperModel is None:
        raise RuntimeError(
            "faster-whisper is required for word-level captions. Run: pip install faster-whisper"
        )

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    cumulative_offset_ms = 0.0

    for voice_path in voice_paths:
        if not voice_path.exists():
            continue
        segments, _ = model.transcribe(str(voice_path), word_timestamps=True)
        for segment in segments:
            if not hasattr(segment, "words") or not segment.words:
                # Fallback: treat whole segment as one caption
                start_ms = segment.start * 1000 + cumulative_offset_ms
                end_ms = segment.end * 1000 + cumulative_offset_ms
                text = f" {segment.text.strip()}" if segment.text.strip() else segment.text
                output_captions.append(
                    {
                        "text": text,
                        "startMs": round(start_ms),
                        "endMs": round(end_ms),
                        "timestampMs": round((start_ms + end_ms) / 2),
                        "confidence": None,
                    }
                )
            else:
                for word in segment.words:
                    start_ms = word.start * 1000 + cumulative_offset_ms
                    end_ms = word.end * 1000 + cumulative_offset_ms
                    w = word.word
                    if w and not w.startswith(" "):
                        w = f" {w}"
                    output_captions.append(
                        {
                            "text": w,
                            "startMs": round(start_ms),
                            "endMs": round(end_ms),
                            "timestampMs": round((start_ms + end_ms) / 2),
                            "confidence": None,
                        }
                    )

        duration = get_audio_duration_seconds(voice_path)
        cumulative_offset_ms += duration * 1000


def prepare(
    cache_key: str,
    video_public: Path,
    use_whisper: bool = True,
    whisper_model: str = "base.en",
) -> Path:
    """Copy assets to public and create manifest. Returns path to manifest."""
    step_start("Prepare Remotion assets")
    chunks_path = cache_path(cache_key, "chunks.json")
    if not chunks_path.exists():
        raise FileNotFoundError(f"No chunks.json at {chunks_path}")

    manifest = json.loads(chunks_path.read_text(encoding="utf-8"))
    scenes = manifest.get("scenes", [])
    if not scenes:
        raise ValueError("No scenes in manifest")

    output_dir = video_public / "shortgen" / cache_key
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "images").mkdir(exist_ok=True)
    (output_dir / "voice").mkdir(exist_ok=True)

    fps = 30
    width = 540
    height = 960

    total_duration = 0.0
    scene_inputs = []
    voice_paths_for_whisper = []

    for i, scene in enumerate(scenes):
        text = scene.get("text", "").strip()
        voice_path = scene.get("voice_path")
        image_path = scene.get("image_path")

        voice_path_resolved = Path(voice_path) if voice_path else None
        image_path_resolved = Path(image_path) if image_path else None

        if not voice_path_resolved or not voice_path_resolved.exists():
            warn(f"  Warning: voice {i + 1} missing, skipping")
            continue
        if not image_path_resolved or not image_path_resolved.exists():
            warn(f"  Warning: image {i + 1} missing, skipping")
            continue

        duration = get_audio_duration_seconds(voice_path_resolved)
        total_duration += duration

        # Copy files - use sequential output names
        out_voice = output_dir / "voice" / f"voice_{len(scene_inputs) + 1}.mp3"
        out_image = output_dir / "images" / f"image_{len(scene_inputs) + 1}.png"
        shutil.copy2(voice_path_resolved, out_voice)
        shutil.copy2(image_path_resolved, out_image)
        voice_paths_for_whisper.append(voice_path_resolved)

        scene_inputs.append(
            {
                "text": text,
                "imagePath": f"images/image_{len(scene_inputs) + 1}.png",
                "voicePath": f"voice/voice_{len(scene_inputs) + 1}.mp3",
                "durationInSeconds": duration,
            }
        )

    # Generate captions: Whisper word-level or scene-level fallback
    captions_path = cache_path(cache_key, "captions", "captions.json")
    captions_path.parent.mkdir(parents=True, exist_ok=True)

    if use_whisper and WhisperModel is not None:
        if captions_path.exists():
            info("  ✓ loading cached Whisper captions")
            captions = json.loads(captions_path.read_text(encoding="utf-8"))
        else:
            info("  ○ Transcribing with Whisper (word-level)...")
            captions = []
            transcribe_audio_with_whisper(
                voice_paths_for_whisper, captions, model_size=whisper_model
            )
            captions_path.write_text(json.dumps(captions, indent=2), encoding="utf-8")
    else:
        # Fallback: scene-level captions from text
        captions = []
        t = 0.0
        for s in scene_inputs:
            dur = s["durationInSeconds"]
            start_ms = t * 1000
            end_ms = (t + dur) * 1000
            t += dur
            caption_text = f" {s['text']}" if s["text"] and not s["text"].startswith(" ") else s["text"]
            captions.append(
                {
                    "text": caption_text,
                    "startMs": round(start_ms),
                    "endMs": round(end_ms),
                    "timestampMs": round((start_ms + end_ms) / 2),
                    "confidence": None,
                }
            )
        if WhisperModel is None:
            warn("  Tip: pip install faster-whisper for word-level captions")

    duration_in_frames = int(round(total_duration * fps))

    video_manifest = {
        "cacheKey": cache_key,
        "fps": fps,
        "width": width,
        "height": height,
        "durationInFrames": duration_in_frames,
        "scenes": scene_inputs,
        "captions": captions,
    }

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(video_manifest, f, indent=2)

    _write_shortgen_index(video_public)

    step_end("Prepare Remotion assets", outputs=[manifest_path])
    return manifest_path


def _write_shortgen_index(video_public: Path) -> None:
    """Write index.json listing all cache keys with manifests for Remotion to discover."""
    shortgen_dir = video_public / "shortgen"
    shortgen_dir.mkdir(parents=True, exist_ok=True)
    cache_keys = []
    for sub in sorted(shortgen_dir.iterdir()):
        if sub.is_dir() and (sub / "manifest.json").exists():
            cache_keys.append(sub.name)
    index_path = shortgen_dir / "index.json"
    index_path.write_text(json.dumps({"cacheKeys": cache_keys}, indent=2), encoding="utf-8")
