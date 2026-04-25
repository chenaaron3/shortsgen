"""Load and validate pipeline config files. Configs define model and system prompt per step."""

import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, computed_field, Field

from path_utils import generation_root, project_root


def config_path_key(name: str) -> str:
    """Sanitize config name for use in cache paths. Keeps it human-readable."""
    s = re.sub(r"[^\w\-]", "_", str(name))
    return s.strip("_") or "default"


class StepConfig(BaseModel):
    """Model + system prompt for one pipeline step (breakdown, script, chunk)."""

    model: str = Field(..., description="LLM model identifier (e.g. gpt-4o, claude-sonnet-4-5-20250929)")
    system_prompt: str = Field(..., description="Prompt filename under prompts/ (e.g. short-script-system-prompt.md)")
    temperature: float | None = Field(default=None, description="LLM temperature (0=deterministic, 1+=creative)")
    judge_model: str | None = Field(default=None, description="Model for script judge (engagement/clarity/payoff). Default: gpt-4o-mini.")
    judge_gate: bool = Field(default=False, description="If true, retry script generation until all judge dimensions pass or max_retries.")
    judge_max_retries: int = Field(default=2, description="Max retries when judge_gate is enabled.")
    judge_samples: int = Field(default=1, description="When >1, generate N scripts in parallel and pick best (no iteration). Used when judge_gate=true.")


class BreakdownStepConfig(StepConfig):
    """Breakdown step: optional chunker strategy (LLM vs deterministic line split)."""

    chunker: Literal["llm", "line_split"] = Field(
        default="llm",
        description="llm: structured LLM breakdown; line_split: deterministic ~100-line segments (cap 10)",
    )


class ImageConfig(BaseModel):
    """Image generation: model alias (params are hardcoded per model in replicate.py)."""

    model: str = Field(..., description="Model alias (e.g. gpt-image-mini, gemini-flash)")
    quality: Literal["low", "medium", "high"] = Field(
        default="low",
        description="Image quality hint for generators that support it (default: low)",
    )
    style_prompt: str | None = Field(
        default=None,
        description="Optional image style prompt override",
    )
    mascot_description: str | None = Field(
        default=None,
        description="Optional mascot description override for text-to-image flows",
    )
    mascot_path: str | None = Field(
        default=None,
        description="Optional mascot image path (absolute or relative to project root)",
    )


class VoiceConfig(BaseModel):
    """Voice generation: TTS backend."""

    backend: str = Field(..., description="Backend name (e.g. elevenlabs, readaloud, ttsvibes)")


class Config(BaseModel):
    """Pipeline config: model and system prompt per LLM step."""

    name: str = Field(default="default", description="Config display name")
    breakdown: BreakdownStepConfig = Field(..., description="Breakdown step (source → nuggets)")
    script: StepConfig = Field(..., description="Script step (raw content → short script)")
    chunk: StepConfig = Field(..., description="Chunk step (script → scenes)")
    image: ImageConfig | None = Field(default=None, description="Image model alias; if absent, use backend default")
    voice: VoiceConfig | None = Field(default=None, description="Voice backend; if absent, use elevenlabs")

    @computed_field
    @property
    def hash(self) -> str:
        """Path key for cache (sanitized config name, human-readable)."""
        return config_path_key(self.name)


def _text_override(raw: str | None) -> str | None:
    """Return stripped non-empty text, else None."""
    if not raw or not str(raw).strip():
        return None
    return str(raw).strip()


def _resolve_mascot_path(raw_path: str | None) -> str | None:
    """Resolve mascot path to absolute string; relative paths are project-root based."""
    if not raw_path or not str(raw_path).strip():
        return None
    p = Path(str(raw_path).strip())
    resolved = p if p.is_absolute() else (project_root() / p)
    return str(resolved)


def config_with_resolved_image(
    config: Config,
    *,
    run_id: str | None = None,
    video_id: str | None = None,
) -> Config:
    """
    Return a copied config with resolved image fields.

    Precedence:
    - style_prompt/mascot_description/mascot_path: brand > config > defaults
    - model/quality: config values
    """
    from path_utils import mascot_path as default_mascot_path
    from pipeline.image_style_defaults import MASCOT_DESCRIPTION, STYLE_PROMPT

    resolved = config.model_copy(deep=True)
    image = resolved.image
    if image is None:
        return resolved

    config_style_prompt = image.style_prompt
    config_mascot_description = image.mascot_description
    config_mascot_path = image.mascot_path

    style_prompt = _text_override(config_style_prompt) or STYLE_PROMPT
    mascot_description = _text_override(config_mascot_description) or MASCOT_DESCRIPTION
    mascot_path = _resolve_mascot_path(config_mascot_path) or str(default_mascot_path())

    if run_id and video_id:
        from run_video.brand_resolve import resolve_brand_for_video_pipeline

        brand_resolved = resolve_brand_for_video_pipeline(
            run_id,
            video_id,
            config_style_prompt=config_style_prompt,
            config_mascot_description=config_mascot_description,
            config_mascot_path=config_mascot_path,
        )
        style_prompt = brand_resolved.style_prompt
        mascot_description = brand_resolved.mascot_description
        mascot_path = str(brand_resolved.mascot_path)

    resolved.image = image.model_copy(
        update={
            "style_prompt": style_prompt,
            "mascot_description": mascot_description,
            "mascot_path": mascot_path,
        }
    )
    return resolved


def load_config(path: Path | str) -> Config:
    """Load config from YAML file. Path can be relative to project root or absolute."""
    try:
        import yaml
    except ImportError:
        raise RuntimeError("PyYAML required for config. Run: pip install pyyaml")

    p = Path(path)
    if p.is_absolute():
        resolved = p
    elif "/" in str(path) or "\\" in str(path):
        resolved = project_root() / p
        if not resolved.exists():
            # e.g. "configs/default.yaml" -> try generation/configs/default.yaml
            alt = generation_root() / "configs" / p.name
            if alt.exists():
                resolved = alt
    else:
        # e.g. "default" or "default.yaml" -> generation/configs/
        resolved = generation_root() / "configs" / (p.stem + ".yaml" if not p.suffix else p.name)
    if not resolved.exists():
        raise FileNotFoundError(f"Config not found: {resolved}")

    data = yaml.safe_load(resolved.read_text(encoding="utf-8"))
    if not data or not isinstance(data, dict):
        raise ValueError("Config must be a non-empty YAML object")

    return Config.model_validate(data)
