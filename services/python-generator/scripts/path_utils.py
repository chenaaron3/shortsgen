"""Centralized path management for the shortgen pipeline."""

import os
from pathlib import Path

_GENERATION_ROOT = Path(__file__).resolve().parent.parent


def _find_project_root() -> Path:
    """Monorepo root (has pnpm-workspace.yaml or sst.config.ts) or parent of generation/."""
    current = _GENERATION_ROOT
    while current.parent != current:
        if (current / "pnpm-workspace.yaml").exists() or (current / "sst.config.ts").exists():
            return current
        if current.parent.name == "services":
            return current.parent.parent
        current = current.parent
    return _GENERATION_ROOT.parent


_PROJECT_ROOT = _find_project_root()


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
    return assets_dir() / "mascot_multiple.png"


def prompts_dir() -> Path:
    """Generation prompts."""
    return _GENERATION_ROOT / "prompts"


def cache_base() -> Path:
    """Base cache directory. In Lambda, use /tmp for writable storage."""
    if os.environ.get("LAMBDA_TASK_ROOT") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp") / "shortgen_cache"
    return _GENERATION_ROOT / "cache"


def breakdown_cache_path(source_hash: str) -> Path:
    """Path to shared breakdown cache: cache/_breakdown/{source_hash}/breakdown.json. Shared across configs."""
    return cache_base() / "_breakdown" / source_hash / "breakdown.json"


def breakdown_raw_path(source_hash: str) -> Path:
    """Path to raw LLM breakdown before post-processing: cache/_breakdown/{source_hash}/breakdown_pre_post_process.json."""
    return cache_base() / "_breakdown" / source_hash / "breakdown_pre_post_process.json"


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
    """Remotion public directory for static assets. In Lambda, use /tmp for output before S3 upload."""
    if os.environ.get("LAMBDA_TASK_ROOT") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp") / "shortgen_public"
    return _PROJECT_ROOT / "public"


def eval_ui_public() -> Path:
    """Eval UI public directory (annotations.json, eval-dataset.json, eval-assets/)."""
    monorepo = _PROJECT_ROOT / "apps" / "eval-ui" / "public"
    if monorepo.exists():
        return monorepo
    return _PROJECT_ROOT / "eval-ui" / "public"


def remotion_app_root() -> Path:
    """Remotion app root (for npx remotion render cwd)."""
    monorepo = _PROJECT_ROOT / "apps" / "remotion"
    if monorepo.exists():
        return monorepo
    return _PROJECT_ROOT


def env_path() -> Path:
    """Project .env file."""
    return _PROJECT_ROOT / ".env"


def references_dir() -> Path:
    """Reference scripts and materials."""
    return _GENERATION_ROOT / "references"
