"""
Image generators for mascot scene images.
Use IMAGE_GENERATOR to select: "gpt" or "replicate".
All credentials and model config are owned by this layer.
"""

import os
from pathlib import Path

from .gpt import generate_image as gpt_generate_image
from .replicate import generate_image as replicate_generate_image

# Set to "gpt" or "replicate" to choose image generation backend
IMAGE_GENERATOR = "replicate"

# Backend defaults (used when model=None)
DEFAULT_MODEL = {
    "gpt": "gpt-image-1-mini",
    "replicate": "openai/gpt-image-1-mini",
}


def _get_backend():
    b = IMAGE_GENERATOR
    if b not in ("gpt", "replicate"):
        raise ValueError(f"Unknown IMAGE_GENERATOR: {b}")
    return b


def _validate_credentials(model: str | None = None) -> None:
    """Raise RuntimeError if required env vars for current backend are missing."""
    backend = _get_backend()
    if backend == "gpt":
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY required for image generation")
    else:
        if not os.getenv("REPLICATE_API_TOKEN"):
            raise RuntimeError("REPLICATE_API_TOKEN required for image generation")
        model_to_check = model or DEFAULT_MODEL["replicate"]
        if "openai/gpt-image" in model_to_check and not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY required for openai/gpt-image-1-mini on Replicate")


def get_config(model_override: str | None = None) -> dict:
    """Return generator metadata for logging. model_override: optional model override from caller."""
    backend = _get_backend()
    model = model_override or DEFAULT_MODEL[backend]
    return {"generator": backend, "model": model}


def generate_image(
    mascot_path: Path,
    prompt: str,
    *,
    model: str | None = None,
    input_fidelity: str = "low",
    **kwargs,
) -> bytes:
    """Generate an image. Credentials and model config are resolved from env and backend defaults."""
    backend = _get_backend()
    model_to_use = model or DEFAULT_MODEL[backend]
    _validate_credentials(model=model_to_use)

    if backend == "gpt":
        return gpt_generate_image(
            mascot_path=mascot_path,
            prompt=prompt,
            api_key=os.environ["OPENAI_API_KEY"],
            input_fidelity=input_fidelity,
            model=model_to_use,
            **kwargs,
        )
    else:
        return replicate_generate_image(
            mascot_path=mascot_path,
            prompt=prompt,
            api_token=os.environ["REPLICATE_API_TOKEN"],
            model=model_to_use,
            input_fidelity=input_fidelity,
            **kwargs,
        )
