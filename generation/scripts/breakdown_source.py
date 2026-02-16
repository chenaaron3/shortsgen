#!/usr/bin/env python3
"""
Break down source material (book, podcast transcript) into atomic idea nuggets.
Called by run_source_pipeline. Outputs to cache/_breakdowns/{hash}/breakdown.json.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import create_model, Field

from models import BreakdownOutput, Nugget

from path_utils import env_path, prompts_dir, breakdown_cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start
from usage_trace import record_llm

load_dotenv(env_path())


def source_hash(source_content: str) -> str:
    """Compute cache key for source: hash(content)."""
    return hashlib.sha256(source_content.encode("utf-8")).hexdigest()[:16]


def _summary_cache_key(summary: str) -> str:
    """Pipeline cache key for a nugget (same as run_pipeline.content_hash)."""
    return hashlib.sha256(summary.encode("utf-8")).hexdigest()[:16]


def load_system_prompt() -> str:
    """Load the source breakdown system prompt."""
    prompt_path = prompts_dir() / "source-breakdown-system-prompt.md"

    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)

    return prompt_path.read_text(encoding="utf-8")


def _breakdown_response_format(max_nuggets: int = 20):
    """Response format: BreakdownOutput (default max 20) or limited model when max_nuggets set."""
    return create_model(
        "BreakdownOutputLimited",
        nuggets=(
            list[Nugget],
            Field(
                ...,
                description="Atomic idea nuggets extracted from source",
                max_length=max_nuggets,
            ),
        ),
    )


def break_down_source(
    client: OpenAI,
    source_content: str,
    model: str = "gpt-4o",
    max_nuggets: int | None = None,
) -> BreakdownOutput:
    """Call the LLM to break down source into atomic nuggets."""
    system_prompt = load_system_prompt()
    user_content = "Break down this source into atomic idea nuggets."
    if max_nuggets is not None:
        user_content += f"\n\nOutput at most {max_nuggets} nugget(s). Prioritize the most important or representative ideas."
    user_content += f"\n\n{source_content}"

    response_format = _breakdown_response_format(max_nuggets)
    try:
        completion = client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format=response_format,
            temperature=0.5,
        )
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            error("Error: LLM refused or returned empty response.")
            sys.exit(1)
        if getattr(completion, "usage", None):
            u = completion.usage
            record_llm("Breakdown", model, u.prompt_tokens, u.completion_tokens)
        return parsed
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)


def run(
    source_content: str,
    source_key: str,
    model: str = "gpt-4o",
    skip_cache: bool = False,
    max_nuggets: int | None = None,
) -> list[Nugget]:
    """
    Break down source into nuggets. Uses cache if available.
    source_key = hash(content)[:16]. Output: cache/_breakdowns/{hash}/breakdown.json
    skip_cache: if True, regenerate even when cached.
    max_nuggets: if set, passed to LLM so it returns at most that many nuggets (saves tokens).
    """
    step_start("Breakdown")
    breakdown_path = breakdown_cache_path(source_key)

    if not skip_cache and breakdown_path.exists():
        cache_hit(breakdown_path)
        data = json.loads(breakdown_path.read_text(encoding="utf-8"))
        nuggets = [Nugget.model_validate(n) for n in data["nuggets"]]
        step_end("Breakdown", outputs=[breakdown_path], cache_hits=1, cache_misses=0)
        return nuggets

    cache_miss("breaking down...")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found")
    client = OpenAI(api_key=api_key)

    result = break_down_source(client, source_content, model, max_nuggets=max_nuggets)
    for n in result.nuggets:
        n.cache_key = _summary_cache_key(n.summary)
    breakdown_path.parent.mkdir(parents=True, exist_ok=True)
    breakdown_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    step_end("Breakdown", outputs=[breakdown_path], cache_hits=0, cache_misses=1)
    return result.nuggets
