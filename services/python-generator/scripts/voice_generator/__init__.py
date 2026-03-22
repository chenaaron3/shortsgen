"""
Voice generators for TTS. Use voice_backend from config or VOICE_GENERATOR env.
"""

import os

from .elevenlabs import generate_for_scenes as elevenlabs_generate_for_scenes
from .readaloud import generate_for_scenes as readaloud_generate_for_scenes
from .readaloud import DEFAULT_VOICE as READALOUD_DEFAULT_VOICE
from .ttsvibes import generate_for_scenes as ttsvibes_generate_for_scenes
from .ttsvibes import DEFAULT_VOICE as TTSVIBES_DEFAULT_VOICE


def _get_backend(voice_backend: str | None = None) -> str:
    if voice_backend and voice_backend.strip().lower() in ("elevenlabs", "readaloud", "ttsvibes"):
        return voice_backend.strip().lower()
    override = (os.getenv("VOICE_GENERATOR") or "").strip().lower()
    if override in ("elevenlabs", "readaloud", "ttsvibes"):
        return override
    return voice_backend.strip().lower() if voice_backend else "elevenlabs"


def get_backend(voice_backend: str | None = None) -> str:
    """Return the active voice backend name (elevenlabs, readaloud, or ttsvibes)."""
    return _get_backend(voice_backend)


def _validate_credentials(voice_backend: str | None = None) -> None:
    backend = _get_backend(voice_backend)
    if backend == "elevenlabs":
        api_key = (os.getenv("ELEVENLABS_API_KEY") or os.getenv("XI_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError(
                "ELEVENLABS_API_KEY (or XI_API_KEY) not found. "
                "Add it to .env or use voice.backend: readaloud in config for free TTS."
            )


def generate_for_scenes(
    scenes: list,
    *,
    cache_key: str = "",
    voice_backend: str | None = None,
    whisper_model: str = "base.en",
    temp_dir=None,
    **kwargs,
) -> list[bytes]:
    """Generate TTS audio for each scene. Returns list of MP3 bytes, one per scene."""
    _validate_credentials(voice_backend)
    backend = _get_backend(voice_backend)

    if backend == "readaloud":
        voice = (os.getenv("READALOUD_VOICE") or "").strip() or READALOUD_DEFAULT_VOICE
        return readaloud_generate_for_scenes(scenes, voice=voice, **kwargs)
    elif backend == "ttsvibes":
        voice = (os.getenv("TTSVIBES_VOICE") or "").strip() or TTSVIBES_DEFAULT_VOICE
        return ttsvibes_generate_for_scenes(scenes, voice=voice, **kwargs)
    else:
        api_key = (os.getenv("ELEVENLABS_API_KEY") or os.getenv("XI_API_KEY") or "").strip()
        voice_id = (os.getenv("ELEVENLABS_VOICE_ID") or "").strip() or "NFG5qt843uXKj4pFvR7C"
        model_id = (os.getenv("ELEVENLABS_MODEL_ID") or "").strip() or "eleven_v3"
        output_format = (os.getenv("ELEVENLABS_OUTPUT_FORMAT") or "").strip() or "mp3_44100_128"

        def _float(key: str, default: float) -> float:
            v = os.getenv(key)
            return float(v) if v is not None else default

        def _bool(key: str, default: bool) -> bool:
            v = os.getenv(key, "").strip().lower()
            if v in ("1", "true", "yes"):
                return True
            if v in ("0", "false", "no"):
                return False
            return default

        stability = _float("ELEVENLABS_STABILITY", 1)
        similarity_boost = _float("ELEVENLABS_SIMILARITY_BOOST", 0.9)
        use_speaker_boost = _bool("ELEVENLABS_USE_SPEAKER_BOOST", True)
        style = _float("ELEVENLABS_STYLE", 0.1)
        speed = _float("ELEVENLABS_SPEED", 1.2)
        seed_val = (os.getenv("ELEVENLABS_SEED") or "").strip()
        seed = int(seed_val) % 4294967296 if seed_val.isdigit() else None

        return elevenlabs_generate_for_scenes(
            scenes,
            api_key=api_key,
            voice_id=voice_id,
            model_id=model_id,
            cache_key=cache_key,
            output_format=output_format,
            stability=stability,
            similarity_boost=similarity_boost,
            use_speaker_boost=use_speaker_boost,
            style=style,
            speed=speed,
            seed=seed,
            whisper_model=whisper_model,
            temp_dir=temp_dir,
            **kwargs,
        )
