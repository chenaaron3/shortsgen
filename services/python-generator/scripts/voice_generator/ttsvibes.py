"""
ttsvibes.com free TTS. One API call per scene.
"""

import base64
import json

import requests

from usage_trace import record_voice

_URL = "https://ttsvibes.com/?/generate"
DEFAULT_VOICE = "tt-en_us_002"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://ttsvibes.com",
    "Referer": "https://ttsvibes.com/",
}


def generate_for_scenes(
    scenes: list,
    *,
    voice: str = DEFAULT_VOICE,
    **kwargs,
) -> list[bytes]:
    """Generate audio for each scene. Returns list of MP3 bytes, one per scene."""
    clips = []
    for scene in scenes:
        text = scene.text.strip()
        if not text:
            raise ValueError("Empty text for scene")
        data = {"selectedVoiceValue": voice, "text": text}
        resp = requests.post(_URL, data=data, headers=_HEADERS, timeout=60)
        resp.raise_for_status()
        rd = resp.json()
        if rd.get("type") != "success" or rd.get("status") != 200:
            raise RuntimeError(f"ttsvibes error: {rd}")
        data_str = rd.get("data", "")
        if not data_str:
            raise RuntimeError("ttsvibes: no data field")
        arr = json.loads(data_str)
        if len(arr) < 3:
            raise RuntimeError(f"ttsvibes: unexpected format {arr}")
        b64 = arr[2]
        if not b64:
            raise RuntimeError("ttsvibes: no audio in response")
        clips.append(base64.b64decode(b64))
    total_chars = sum(len(s.text.strip()) for s in scenes)
    if total_chars:
        record_voice("Voice", "ttsvibes", total_chars)
    return clips
