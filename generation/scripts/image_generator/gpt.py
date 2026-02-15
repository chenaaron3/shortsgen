"""
OpenAI images/edits (img2img) using gpt-image-1-mini.
"""

import base64
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

GPT_IMAGE_MINI = "gpt-image-1-mini"
GPT_IMAGE_1 = "gpt-image-1"
GPT_IMAGE_15 = "gpt-image-1.5"

# Model → size override (must be valid API sizes: 1024x1024, 1536x1024, 1024x1536, auto)
MODEL_SIZE: dict[str, str] = {
    GPT_IMAGE_MINI: "1024x1536",
    GPT_IMAGE_1: "1024x1536",
    GPT_IMAGE_15: "1024x1536",
}
RETRY_DELAY = 5  # seconds between retries on 429


def _image_to_data_uri(path: Path) -> str:
    """Convert image file to base64 data URI for OpenAI images/edits API."""
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    ext = path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{b64}"


def generate_image(
    mascot_path: Path,
    prompt: str,
    *,
    api_key: str,
    input_fidelity: str = "low",
    model: str = GPT_IMAGE_MINI,
    **kwargs,
) -> bytes:
    """Call OpenAI images/edits API (img2img) via JSON."""
    image_uri = _image_to_data_uri(mascot_path)
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
                time.sleep(wait)
                continue
            raise RuntimeError(f"OpenAI API error {e.code}: {body or str(e)}") from e

        data = result.get("data")
        if not data:
            if attempt < 9:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise RuntimeError("No output from OpenAI images/edits")

        b64_data = data[0].get("b64_json")
        if not b64_data:
            raise RuntimeError("OpenAI returned no base64 image data")

        return base64.b64decode(b64_data)
