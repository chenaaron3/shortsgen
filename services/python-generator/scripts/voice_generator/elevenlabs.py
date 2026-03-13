"""
ElevenLabs TTS. Single API call for full script, then split by scene using alignment or Whisper fallback.
"""

import base64
import hashlib
import io
from pathlib import Path

import requests
from pydub import AudioSegment

from usage_trace import record_voice

DEFAULT_VOICE_ID = "NFG5qt843uXKj4pFvR7C"
DEFAULT_MODEL_ID = "eleven_v3"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_STABILITY = 1
DEFAULT_SIMILARITY_BOOST = 0.9
DEFAULT_USE_SPEAKER_BOOST = True
DEFAULT_STYLE = 0.1
DEFAULT_SPEED = 1.2


def _seed_from_cache_key(cache_key: str) -> int:
    """Deterministic seed (0–4294967295) for consistent voice."""
    h = hashlib.sha256(cache_key.encode()).hexdigest()[:8]
    return int(h, 16) % 4294967296


def _generate_full_audio(
    api_key: str,
    full_text: str,
    voice_id: str,
    model_id: str,
    output_format: str,
    stability: float,
    similarity_boost: float,
    use_speaker_boost: bool,
    style: float,
    speed: float,
    seed: int,
) -> tuple[bytes, dict | None]:
    """Call ElevenLabs with-timestamps API. Returns (audio_bytes, alignment or None)."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": full_text,
        "model_id": model_id,
        "output_format": output_format,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
            "use_speaker_boost": use_speaker_boost,
            "style": style,
            "speed": speed,
        },
        "seed": seed,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=120)
    if not resp.ok:
        msg = resp.text or resp.reason
        if resp.status_code == 401:
            msg = (
                "ElevenLabs 401 Unauthorized: API key invalid or expired. "
                "Get a fresh key from https://elevenlabs.io/app/settings/api-keys"
            )
        raise RuntimeError(f"ElevenLabs API error {resp.status_code}: {msg}")

    data = resp.json()
    audio_b64 = data.get("audio_base64")
    if not audio_b64:
        raise RuntimeError("ElevenLabs response missing audio_base64")
    audio_bytes = base64.b64decode(audio_b64)
    record_voice("Voice", model_id, len(full_text))
    alignment = data.get("alignment") or data.get("normalized_alignment")
    return audio_bytes, alignment


def _get_scene_boundaries_from_char_alignment(
    scenes: list, full_text: str, alignment: dict
) -> list[tuple[float, float]] | None:
    """Use character-level alignment to compute scene start/end times in seconds."""
    starts = alignment.get("character_start_times_seconds")
    ends = alignment.get("character_end_times_seconds")
    if not starts or not ends or len(starts) == 0:
        return None
    if len(starts) != len(full_text):
        return None
    pos = 0
    boundaries = []
    for scene in scenes:
        t = scene.text.strip()
        n = len(t)
        if n == 0:
            boundaries.append((0.0, 0.0))
            continue
        start_idx = pos
        end_idx = min(pos + n - 1, len(starts) - 1)
        start_s = float(starts[start_idx]) if start_idx < len(starts) else 0.0
        end_s = float(ends[end_idx]) if end_idx >= 0 else 0.0
        boundaries.append((start_s, end_s))
        pos += n
        if pos < len(full_text) and full_text[pos : pos + 1] == " ":
            pos += 1
    return boundaries


def _transcribe_with_whisper(audio_path: Path, model_size: str = "base.en") -> list[dict]:
    """Word-level Whisper transcription. Returns [{word, start, end}, ...]"""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper required for word-level alignment. pip install faster-whisper"
        )
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio_path), word_timestamps=True)
    words = []
    for seg in segments:
        if hasattr(seg, "words") and seg.words:
            for w in seg.words:
                words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
        else:
            words.append({"word": seg.text.strip(), "start": seg.start, "end": seg.end})
    return words


def _get_scene_boundaries_from_whisper(
    scenes: list, whisper_words: list[dict]
) -> list[tuple[float, float]]:
    """Map scene texts (word count) to Whisper word timestamps. Uses plain text (no tags)."""
    boundaries = []
    wi = 0
    for scene in scenes:
        plain = scene.text.strip()
        wc = len(plain.split()) if plain else 0
        if wc == 0:
            boundaries.append((0.0, 0.0))
            continue
        used = 0
        start_s = None
        end_s = None
        while wi < len(whisper_words) and used < wc:
            w = whisper_words[wi]
            if start_s is None:
                start_s = w["start"]
            end_s = w["end"]
            used += 1
            wi += 1
        if start_s is None:
            start_s = boundaries[-1][1] if boundaries else 0.0
        if end_s is None:
            end_s = start_s + 1.0
        boundaries.append((start_s, end_s))
    return boundaries


def _split_audio_at_boundaries(
    audio_bytes: bytes, boundaries: list[tuple[float, float]]
) -> list[bytes]:
    """Split audio into scene clips with clean cuts: no gaps, no overlap."""
    audio = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
    total_ms = len(audio)
    cut_ms = [int(b[0] * 1000) for b in boundaries]
    cut_ms.append(total_ms)
    clips = []
    for i in range(len(boundaries)):
        start_ms = cut_ms[i]
        end_ms = cut_ms[i + 1]
        if end_ms <= start_ms:
            end_ms = start_ms + 100
        clip = audio[start_ms:end_ms]
        buffer = io.BytesIO()
        clip.export(buffer, format="mp3", bitrate="128k")
        clips.append(buffer.getvalue())
    return clips


def generate_for_scenes(
    scenes: list,
    *,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL_ID,
    cache_key: str = "",
    output_format: str = DEFAULT_OUTPUT_FORMAT,
    stability: float = DEFAULT_STABILITY,
    similarity_boost: float = DEFAULT_SIMILARITY_BOOST,
    use_speaker_boost: bool = DEFAULT_USE_SPEAKER_BOOST,
    style: float = DEFAULT_STYLE,
    speed: float = DEFAULT_SPEED,
    seed: int | None = None,
    whisper_model: str = "base.en",
    temp_dir: Path | None = None,
    **kwargs,
) -> list[bytes]:
    """Single TTS call for full script, align/split by scene, return list of MP3 bytes."""
    texts = [s.text.strip() for s in scenes]
    full_text = " ".join(t for t in texts if t)
    if not full_text:
        return []

    seed_val = seed if seed is not None else _seed_from_cache_key(cache_key)

    audio_bytes, alignment = _generate_full_audio(
        api_key=api_key,
        full_text=full_text,
        voice_id=voice_id,
        model_id=model_id,
        output_format=output_format,
        stability=stability,
        similarity_boost=similarity_boost,
        use_speaker_boost=use_speaker_boost,
        style=style,
        speed=speed,
        seed=seed_val,
    )

    boundaries = None
    if alignment:
        boundaries = _get_scene_boundaries_from_char_alignment(scenes, full_text, alignment)

    if not boundaries and temp_dir:
        temp_mp3 = temp_dir / "_full_temp.mp3"
        temp_mp3.write_bytes(audio_bytes)
        try:
            whisper_words = _transcribe_with_whisper(temp_mp3, model_size=whisper_model)
            boundaries = _get_scene_boundaries_from_whisper(scenes, whisper_words)
        finally:
            temp_mp3.unlink(missing_ok=True)

    if not boundaries or len(boundaries) != len(scenes):
        raise RuntimeError("Failed to compute scene boundaries from alignment")

    return _split_audio_at_boundaries(audio_bytes, boundaries)
