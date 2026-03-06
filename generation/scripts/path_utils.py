"""Centralized path management for the shortgen pipeline."""

from pathlib import Path

_GENERATION_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _GENERATION_ROOT.parent


def project_root() -> Path:
    """Remotion project root (parent of generation/)."""
    return _PROJECT_ROOT


def generation_root() -> Path:
    """Generation directory (cache, prompts, scripts, assets)."""
    return _GENERATION_ROOT


def assets_dir() -> Path:
    """Generation assets (mascot, etc.)."""
    return _GENERATION_ROOT / "assets"


def mascot_path() -> Path:
    """Default mascot canvas image path."""
    return assets_dir() / "ghibli.png"


def prompts_dir() -> Path:
    """Generation prompts."""
    return _GENERATION_ROOT / "prompts"


def cache_base() -> Path:
    """Base cache directory."""
    return _GENERATION_ROOT / "cache"


def breakdown_cache_path(source_hash: str) -> Path:
    """Path to shared breakdown cache: cache/_breakdown/{source_hash}/breakdown.json. Shared across configs."""
    return cache_base() / "_breakdown" / source_hash / "breakdown.json"


def breakdown_output_dir(source_hash: str, config_hash: str) -> Path:
    """Per-config output dir for breakdown: cache/{config_hash}/breakdowns/{source_hash}/. videos.md, upload_state.json."""
    return cache_base() / config_hash / "breakdowns" / source_hash


def video_cache_path(cache_key: str, config_hash: str, *parts: str) -> Path:
    """Path under cache/{config_hash}/videos/{cache_key}/. Replaces old cache_path."""
    return cache_base() / config_hash / "videos" / cache_key / Path(*parts)


def remotion_composite_key(config_hash: str, cache_key: str) -> str:
    """Composite key for Remotion: public/shortgen/{composite}/manifest.json."""
    return f"{config_hash}_{cache_key}"


def video_public() -> Path:
    """Remotion public directory for static assets."""
    return _PROJECT_ROOT / "public"


def env_path() -> Path:
    """Project .env file."""
    return _PROJECT_ROOT / ".env"


def references_dir() -> Path:
    """Reference scripts and materials."""
    return _GENERATION_ROOT / "references"
