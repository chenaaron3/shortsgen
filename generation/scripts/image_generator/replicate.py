"""
Replicate img2img via HTTP API (no SDK). Uses openai/gpt-image-1-mini by default.
Env: REPLICATE_API_TOKEN, OPENAI_API_KEY (for openai/gpt-image-1-mini)
     NSFW safety checker is always disabled (avoids false positives on benign mascot prompts).
"""

import base64
import json
import os
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from logger import info, warn

DEFAULT_MODEL = "openai/gpt-image-1-mini"
API_BASE = "https://api.replicate.com/v1"

# Alias → full Replicate model ID. Params are hardcoded per model below.
REPLICATE_MODEL_ALIASES = {
    "gpt-image-mini": "openai/gpt-image-1-mini",
    "gpt-image": "openai/gpt-image-1",
    "gemini-flash": "google/gemini-2.5-flash-image",
}


def _resolve_model(model: str) -> str:
    """Resolve alias to full Replicate model ID."""
    return REPLICATE_MODEL_ALIASES.get(model, model)
WAIT_SECONDS = 60  # Max for Prefer: wait
MAX_RETRIES = 10
DEFAULT_RETRY_AFTER = 60


def _image_to_data_uri(path: Path) -> str:
    """Convert image to data URI for API input (files < 256kb recommended)."""
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    ext = path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{b64}"


def _disable_safety_checker() -> bool:
    """Always True to bypass NSFW filter (avoids false positives on benign mascot prompts)."""
    return True


def generate_image(
    mascot_path: Path,
    prompt: str,
    *,
    api_token: str,
    model: str = DEFAULT_MODEL,
    input_fidelity: str = "low",
    prototype: bool = False,
    **kwargs,
) -> bytes:
    """Call Replicate HTTP API. When prototype, text-to-image only (no mascot). Otherwise img2img."""
    model = _resolve_model(model)
    disable_safety = _disable_safety_checker()

    if prototype:
        # Text-to-image only (Hyper Flux 8Step)
        input_payload = {
            "prompt": prompt,
            "seed": 0,
            "width": 256,
            "height": 256,
            "num_outputs": 1,
            "aspect_ratio": "1:1",
            "output_format": "png",
            "guidance_scale": 3.5,
            "output_quality": 80,
            "num_inference_steps": 8,
        }
        if disable_safety:
            input_payload["disable_safety_checker"] = True
    else:
        data_uri = _image_to_data_uri(mascot_path)
        if "openai/gpt-image" in model:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY required for openai/gpt-image-1-mini on Replicate")
            input_payload = {
                "input_images": [data_uri],
                "prompt": prompt,
                "input_fidelity": input_fidelity,
                "output_format": "png",
                "aspect_ratio": "1:1",
                "background": "transparent",
                "openai_api_key": api_key,
            }
            # gpt-image may pass through to models with Replicate safety checker
            if disable_safety:
                input_payload["disable_safety_checker"] = True
        elif "google/gemini" in model or "gemini-2.5-flash-image" in model:
            # Gemini 2.5 Flash image: image_input, aspect_ratio, output_format (hardcoded)
            input_payload = {
                "prompt": prompt,
                "image_input": [data_uri],
                "aspect_ratio": "match_input_image",
                "output_format": "jpg",
            }
        else:
            input_payload = {
                "image": data_uri,
                "prompt": prompt,
            }
            if disable_safety:
                input_payload["disable_safety_checker"] = True

    body = json.dumps({"version": model, "input": input_payload}).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
        "Prefer": f"wait={WAIT_SECONDS}",
    }

    for attempt in range(MAX_RETRIES):
        try:
            attempt_info = f" (attempt {attempt + 1}/{MAX_RETRIES})" if attempt > 0 else ""
            info(f"  Initiating Replicate request: model={model}{attempt_info}")
            req = Request(f"{API_BASE}/predictions", data=body, headers=headers, method="POST")
            with urlopen(req, timeout=WAIT_SECONDS + 30) as resp:
                result = json.loads(resp.read().decode())
        except HTTPError as e:
            err_body = ""
            if e.fp:
                try:
                    err_body = e.fp.read().decode()
                except Exception:
                    pass
            if e.code == 429 and attempt < MAX_RETRIES - 1:
                retry_after = DEFAULT_RETRY_AFTER
                try:
                    err_json = json.loads(err_body) if err_body else {}
                    retry_after = int(err_json.get("retry_after", DEFAULT_RETRY_AFTER))
                except (json.JSONDecodeError, ValueError):
                    pass
                retry_after = max(1, min(retry_after, 120))
                warn(f"  Rate limited (429), retrying in {retry_after}s (attempt {attempt + 1}/{MAX_RETRIES})...")
                time.sleep(retry_after)
                continue
            raise RuntimeError(f"Replicate API error {e.code}: {err_body or str(e)}") from e
        except URLError as e:
            if attempt < MAX_RETRIES - 1:
                warn(f"  Request failed, retrying in {DEFAULT_RETRY_AFTER}s (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                time.sleep(DEFAULT_RETRY_AFTER)
                continue
            raise RuntimeError(f"Replicate API request failed: {e}") from e

        try:
            if result.get("error"):
                raise RuntimeError(f"Replicate prediction failed: {result['error']}")

            output = result.get("output")
            status = result.get("status", "unknown")

            # Sync wait may timeout before model finishes — poll until complete
            if not output and status in ("starting", "processing"):
                get_url = (result.get("urls") or {}).get("get")
                if not get_url:
                    raise RuntimeError(f"Replicate returned no output (status={status}), no poll URL")
                warn(f"  Prediction still {status}, polling until complete...")
                poll_interval = 2
                max_poll_time = 300  # 5 min max
                elapsed = 0
                while elapsed < max_poll_time:
                    time.sleep(poll_interval)
                    elapsed += poll_interval
                    poll_req = Request(get_url, headers={"Authorization": f"Bearer {api_token}"})
                    with urlopen(poll_req, timeout=30) as poll_resp:
                        result = json.loads(poll_resp.read().decode())
                    if result.get("error"):
                        raise RuntimeError(f"Replicate prediction failed: {result['error']}")
                    status = result.get("status", "unknown")
                    output = result.get("output")
                    if status in ("succeeded", "successful") and output:
                        break
                    if status in ("failed", "canceled"):
                        raise RuntimeError(f"Replicate prediction {status}: {result.get('error', 'unknown')}")
                if not output:
                    raise RuntimeError(f"Replicate timed out after polling {elapsed}s (status={status})")

            if not output:
                raise RuntimeError(f"Replicate returned no output (status={status})")

            # output is list of URLs for image models, or single URL
            url = output[0] if isinstance(output, list) else output
            if not isinstance(url, str) or not url.startswith("http"):
                raise RuntimeError("Unexpected Replicate output format")

            # Fetch image (replicate.delivery URLs may need Authorization)
            img_req = Request(url, headers={"Authorization": f"Bearer {api_token}"})
            with urlopen(img_req, timeout=60) as img_resp:
                return img_resp.read()

        except (RuntimeError, HTTPError, URLError) as e:
            if attempt < MAX_RETRIES - 1:
                warn(f"  Prediction failed, retrying in {DEFAULT_RETRY_AFTER}s (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                time.sleep(DEFAULT_RETRY_AFTER)
                continue
            raise
