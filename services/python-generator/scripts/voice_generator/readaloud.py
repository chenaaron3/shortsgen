"""
read-aloud.com free TTS (read-aloud-s4ov.onrender.com). One API call per scene.
"""

import requests

from usage_trace import record_voice

_URL = "https://read-aloud-s4ov.onrender.com/api/tts"
DEFAULT_VOICE = "en-GB-SoniaNeural"
_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": "https://read-aloud.com",
    "Referer": "https://read-aloud.com/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
}


def generate_for_scenes(
    scenes: list,
    *,
    voice: str = DEFAULT_VOICE,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    **kwargs,
) -> list[bytes]:
    """Generate audio for each scene. Returns list of MP3 bytes, one per scene."""
    clips = []
    for scene in scenes:
        text = scene.text.strip()
        if not text:
            raise ValueError("Empty text for scene")
        payload = {"text": text, "voice": voice, "rate": rate, "pitch": pitch}
        resp = requests.post(_URL, json=payload, headers=_HEADERS, timeout=60)
        resp.raise_for_status()
        clips.append(resp.content)
    total_chars = sum(len(s.text.strip()) for s in scenes)
    if total_chars:
        record_voice("Voice", "readaloud", total_chars)
    return clips
