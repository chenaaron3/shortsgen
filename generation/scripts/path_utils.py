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
    return assets_dir() / "mascot_glasses.png"


def prompts_dir() -> Path:
    """Generation prompts."""
    return _GENERATION_ROOT / "prompts"


def cache_base() -> Path:
    """Base cache directory."""
    return _GENERATION_ROOT / "cache"


def cache_path(cache_key: str, *parts: str) -> Path:
    """Path under cache/{cache_key}/."""
    return cache_base() / cache_key / Path(*parts)


def breakdown_cache_path(source_hash: str) -> Path:
    """Path to breakdown cache: cache/_breakdowns/{hash}/breakdown.json."""
    return cache_base() / "_breakdowns" / source_hash / "breakdown.json"


def video_public() -> Path:
    """Remotion public directory for static assets."""
    return _PROJECT_ROOT / "public"


def env_path() -> Path:
    """Project .env file."""
    return _PROJECT_ROOT / ".env"
