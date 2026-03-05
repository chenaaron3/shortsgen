"""Load and validate pipeline config files. Configs define model and system prompt per step."""

import re
from pathlib import Path

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


class Config(BaseModel):
    """Pipeline config: model and system prompt per LLM step."""

    name: str = Field(default="default", description="Config display name")
    breakdown: StepConfig = Field(..., description="Breakdown step (source → nuggets)")
    script: StepConfig = Field(..., description="Script step (raw content → short script)")
    chunk: StepConfig = Field(..., description="Chunk step (script → scenes)")

    @computed_field
    @property
    def hash(self) -> str:
        """Path key for cache (sanitized config name, human-readable)."""
        return config_path_key(self.name)


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
