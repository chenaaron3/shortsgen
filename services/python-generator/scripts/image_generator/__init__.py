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

# input_fidelity="high" requires gpt-image-1 (mini does not support it)
HIGH_FIDELITY_MODEL = {
    "gpt": "gpt-image-1",
    "replicate": "openai/gpt-image-1",
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
    source_image: Path | None = None,
    model: str | None = None,
    input_fidelity: str = "low",
    text_to_image_only: bool = False,
    **kwargs,
) -> bytes:
    """Generate an image. When source_image is set, use it as img2img input (for transitions); else use mascot_path. When text_to_image_only, use Replicate text-to-image only (no mascot)."""
    if text_to_image_only:
        if _get_backend() != "replicate":
            raise RuntimeError("Text-to-image only mode requires IMAGE_GENERATOR=replicate")
    backend = _get_backend()
    model_to_use = model or DEFAULT_MODEL[backend]
    if input_fidelity == "high" and "mini" in model_to_use:
        model_to_use = HIGH_FIDELITY_MODEL[backend]
    _validate_credentials(model=model_to_use)
    input_path = source_image if source_image is not None else mascot_path

    if backend == "gpt":
        return gpt_generate_image(
            mascot_path=input_path,
            prompt=prompt,
            api_key=os.environ["OPENAI_API_KEY"],
            input_fidelity=input_fidelity,
            model=model_to_use,
            **kwargs,
        )
    else:
        return replicate_generate_image(
            mascot_path=input_path,
            prompt=prompt,
            api_token=os.environ["REPLICATE_API_TOKEN"],
            model=model_to_use,
            input_fidelity=input_fidelity,
            text_to_image_only=text_to_image_only,
            **kwargs,
        )
