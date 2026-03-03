#!/usr/bin/env python3
"""
Score a short-form script on Engagement, Clarity, and Payoff.
Three separate LLM calls (one per dimension). Used for script selection when --samples > 1.
"""

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion
from pydantic import BaseModel, Field

from path_utils import env_path, prompts_dir
from schema_utils import schema_for_openai
from usage_trace import record_llm

load_dotenv(env_path())

DIMENSIONS = ("engagement", "clarity", "payoff")


class DimensionResult(BaseModel):
    """Pass/fail, critique, suggestion, and reasoning for one dimension."""

    passed: bool = Field(..., description="Pass or fail")
    critique: str = Field(..., description="Brief rationale")
    suggestion: str = Field(..., description="Concrete suggested improvement to the script")
    suggestion_reasoning: str = Field(..., description="Why this suggestion would improve the script")


class JudgeScriptOutput(BaseModel):
    """Structured output from script judge: all three dimensions."""

    engagement: DimensionResult
    clarity: DimensionResult
    payoff: DimensionResult


def _load_judge_prompt(dim: str) -> str:
    """Load the dimension-specific judge prompt."""
    prompt_path = prompts_dir() / "eval" / f"judge-script-{dim}.md"
    if not prompt_path.exists():
        raise FileNotFoundError(f"Judge prompt not found at {prompt_path}")
    return prompt_path.read_text(encoding="utf-8")


def _extract_json(content: str) -> str:
    """Extract JSON from response (handle markdown code blocks)."""
    content = content.strip()
    if content.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            return match.group(1).strip()
    return content


def judge_dimension(script: str, dim: str, model: str = "gpt-4o-mini") -> DimensionResult:
    """
    Score a script on a single dimension. One LLM call.

    Returns:
        DimensionResult with passed/critique.
    """
    system_prompt = _load_judge_prompt(dim)
    schema = DimensionResult.model_json_schema()
    schema = schema_for_openai(schema)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "DimensionResult",
            "strict": True,
            "schema": schema,
        },
    }

    response = completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Evaluate this script on {dim}:\n\n{script}"},
        ],
        response_format=response_format,
        temperature=0.0,
    )
    content = (response.choices[0].message.content or "").strip()
    content = _extract_json(content)
    parsed = DimensionResult.model_validate_json(content)
    if getattr(response, "usage", None):
        u = response.usage
        record_llm(f"Judge-{dim}", model, u.prompt_tokens, u.completion_tokens)
    return parsed


def judge_script(
    script: str,
    model: str = "gpt-4o-mini",
    dimensions: tuple[str, ...] | None = None,
) -> JudgeScriptOutput:
    """
    Score a script on Engagement, Clarity, Payoff. LLM calls in parallel.

    Args:
        script: Script text to evaluate.
        model: LLM model for judge.
        dimensions: If provided, only score these dimensions. Else all DIMENSIONS.

    Returns:
        JudgeScriptOutput with pass/critique per dimension.
    """
    dims = dimensions if dimensions is not None else DIMENSIONS
    results: dict[str, DimensionResult] = {}

    def _call(dim: str) -> tuple[str, DimensionResult]:
        return dim, judge_dimension(script, dim, model=model)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {ex.submit(_call, d): d for d in dims}
        for future in as_completed(futures):
            dim, result = future.result()
            results[dim] = result

    # Fill in any missing dimensions (when dimensions filter was used) with stub
    for d in DIMENSIONS:
        if d not in results:
            results[d] = DimensionResult(
                passed=False,
                critique="",
                suggestion="",
                suggestion_reasoning="",
            )

    return JudgeScriptOutput(
        engagement=results["engagement"],
        clarity=results["clarity"],
        payoff=results["payoff"],
    )


def score_script(
    script: str,
    model: str = "gpt-4o-mini",
    dimensions: tuple[str, ...] | None = None,
) -> dict:
    """
    Judge a script and return a simple dict for selection logic.
    Keys: engagement, clarity, payoff (or subset if dimensions specified).
    Values: { "pass", "critique", "suggestion", "suggestion_reasoning" }.
    """
    result = judge_script(script, model=model, dimensions=dimensions)
    out = {
        "engagement": {
            "pass": result.engagement.passed,
            "critique": result.engagement.critique,
            "suggestion": result.engagement.suggestion,
            "suggestion_reasoning": result.engagement.suggestion_reasoning,
        },
        "clarity": {
            "pass": result.clarity.passed,
            "critique": result.clarity.critique,
            "suggestion": result.clarity.suggestion,
            "suggestion_reasoning": result.clarity.suggestion_reasoning,
        },
        "payoff": {
            "pass": result.payoff.passed,
            "critique": result.payoff.critique,
            "suggestion": result.payoff.suggestion,
            "suggestion_reasoning": result.payoff.suggestion_reasoning,
        },
    }
    if dimensions is not None:
        return {d: out[d] for d in dimensions}
    return out


def select_best(scores: list[dict]) -> int:
    """
    Given a list of score dicts (one per sample), return index of best.
    Tie-break: most passes wins; then first sample.
    """
    if not scores:
        raise ValueError("No scores to select from")
    best_idx = 0
    best_passes = sum(1 for v in scores[0].values() if v.get("pass"))
    for i, s in enumerate(scores[1:], 1):
        passes = sum(1 for v in s.values() if v.get("pass"))
        if passes > best_passes:
            best_passes = passes
            best_idx = i
    return best_idx
