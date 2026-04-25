"""Resolve brand + image prompt fields + mascot path for pipeline generation from run/video + DB."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from path_utils import mascot_path as default_mascot_path, project_root
from pipeline.image_style_defaults import MASCOT_DESCRIPTION, STYLE_PROMPT
from run_video.persistence.run_video_writer import (
    get_brand,
    get_latest_brand_for_user,
    get_run,
    get_video,
    update_video,
)
from run_video.s3_upload import download_s3_key_to_temp
from schemas.table_models import Brand


def _text_override(raw: str | None) -> str | None:
    """Non-empty stripped DB value, or None to fall back to STYLE_PROMPT / MASCOT_DESCRIPTION."""
    if not raw or not str(raw).strip():
        return None
    return str(raw).strip()


def _resolved_prompts_from_brand(brand: Brand | None) -> tuple[str, str]:
    """Apply account brand overrides with fallbacks to shared defaults."""
    if not brand:
        return STYLE_PROMPT, MASCOT_DESCRIPTION
    style = _text_override(brand.style_prompt) or STYLE_PROMPT
    mascot = _text_override(brand.mascot_description) or MASCOT_DESCRIPTION
    return style, mascot


def _resolve_config_mascot_path(raw_path: str | None) -> Path | None:
    """Resolve config mascot path (absolute or relative to project root)."""
    if not raw_path or not str(raw_path).strip():
        return None
    p = Path(str(raw_path).strip())
    return p if p.is_absolute() else (project_root() / p)


def _resolved_prompts_with_fallbacks(
    brand: Brand | None,
    *,
    config_style_prompt: str | None = None,
    config_mascot_description: str | None = None,
) -> tuple[str, str]:
    """Resolve brand > config > default for style and mascot text."""
    if not brand:
        style = _text_override(config_style_prompt) or STYLE_PROMPT
        mascot = _text_override(config_mascot_description) or MASCOT_DESCRIPTION
        return style, mascot

    style = _text_override(brand.style_prompt) or _text_override(config_style_prompt) or STYLE_PROMPT
    mascot = _text_override(brand.mascot_description) or _text_override(config_mascot_description) or MASCOT_DESCRIPTION
    return style, mascot


@dataclass(frozen=True)
class ResolvedBrandPipeline:
    """Output of resolve_brand_for_video_pipeline (always concrete prompt strings)."""

    brand: Brand | None
    style_prompt: str
    mascot_description: str
    mascot_path: Path


def resolve_brand_for_video_pipeline(
    run_id: str,
    video_id: str,
    *,
    config_style_prompt: str | None = None,
    config_mascot_description: str | None = None,
    config_mascot_path: str | None = None,
) -> ResolvedBrandPipeline:
    """
    Load brand for this clip, pin video.brand_id when needed, resolve prompts and mascot file.

    Pins video.brand_id to latest user brand on first asset gen if unset.
    """
    run = get_run(run_id)
    config_mascot = _resolve_config_mascot_path(config_mascot_path)
    if not run:
        style, mascot = _resolved_prompts_with_fallbacks(
            None,
            config_style_prompt=config_style_prompt,
            config_mascot_description=config_mascot_description,
        )
        return ResolvedBrandPipeline(None, style, mascot, config_mascot or default_mascot_path())
    video = get_video(video_id)
    if not video:
        style, mascot = _resolved_prompts_with_fallbacks(
            None,
            config_style_prompt=config_style_prompt,
            config_mascot_description=config_mascot_description,
        )
        return ResolvedBrandPipeline(None, style, mascot, config_mascot or default_mascot_path())

    user_id = str(run.userId)
    brand_row: Brand | None = None

    if video.brand_id:
        brand_row = get_brand(str(video.brand_id))
        if brand_row and str(brand_row.userId) != user_id:
            brand_row = get_latest_brand_for_user(user_id)
            if brand_row:
                update_video(video_id, brand_id=str(brand_row.id))
        elif not brand_row:
            brand_row = get_latest_brand_for_user(user_id)
            if brand_row:
                update_video(video_id, brand_id=str(brand_row.id))
    else:
        brand_row = get_latest_brand_for_user(user_id)
        if brand_row:
            update_video(video_id, brand_id=str(brand_row.id))

    if not brand_row:
        style, mascot = _resolved_prompts_with_fallbacks(
            None,
            config_style_prompt=config_style_prompt,
            config_mascot_description=config_mascot_description,
        )
        return ResolvedBrandPipeline(None, style, mascot, config_mascot or default_mascot_path())

    style, mascot = _resolved_prompts_with_fallbacks(
        brand_row,
        config_style_prompt=config_style_prompt,
        config_mascot_description=config_mascot_description,
    )

    if brand_row.avatar_s3_key:
        try:
            mascot_path = download_s3_key_to_temp(brand_row.avatar_s3_key, prefix="brand_avatar_")
        except Exception:
            mascot_path = config_mascot or default_mascot_path()
        return ResolvedBrandPipeline(brand_row, style, mascot, mascot_path)

    return ResolvedBrandPipeline(brand_row, style, mascot, config_mascot or default_mascot_path())
