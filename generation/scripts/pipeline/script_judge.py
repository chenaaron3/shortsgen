#!/usr/bin/env python3
"""
Score a short-form script on Engagement, Clarity, and Payoff.
Three separate LLM calls (one per dimension). Used for script selection when --samples > 1.
"""

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from models import DimensionScore, JudgeScore
from path_utils import env_path, prompts_dir
from schema_utils import schema_for_openai
from usage_trace import record_llm

load_dotenv(env_path())

DIMENSIONS = ("engagement", "clarity", "payoff")


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


def judge_dimension(script: str, dim: str, model: str = "gpt-4o-mini") -> DimensionScore:
    """
    Score a script on a single dimension. One LLM call.

    Returns:
        DimensionScore with passed/critique/suggestion.
    """
    system_prompt = _load_judge_prompt(dim)
    schema = DimensionScore.model_json_schema()
    schema = schema_for_openai(schema)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "DimensionScore",
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
    parsed = DimensionScore.model_validate_json(content)
    if getattr(response, "usage", None):
        u = response.usage
        record_llm(f"Judge-{dim}", model, u.prompt_tokens, u.completion_tokens)
    return parsed


def judge_script(
    script: str,
    model: str = "gpt-4o-mini",
    dimensions: tuple[str, ...] | None = None,
) -> JudgeScore:
    """
    Score a script on Engagement, Clarity, Payoff. LLM calls in parallel.

    Args:
        script: Script text to evaluate.
        model: LLM model for judge.
        dimensions: If provided, only score these dimensions. Else all DIMENSIONS.

    Returns:
        JudgeScore with pass/critique per dimension.
    """
    dims = dimensions if dimensions is not None else DIMENSIONS
    results: dict[str, DimensionScore] = {}

    def _call(dim: str) -> tuple[str, DimensionScore]:
        return dim, judge_dimension(script, dim, model=model)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {ex.submit(_call, d): d for d in dims}
        for future in as_completed(futures):
            dim, result = future.result()
            results[dim] = result

    # Fill in any missing dimensions (when dimensions filter was used) with stub
    stub = DimensionScore(passed=False, critique="", suggestion="", suggestion_reasoning="")
    for d in DIMENSIONS:
        if d not in results:
            results[d] = stub

    return JudgeScore(
        engagement=results["engagement"],
        clarity=results["clarity"],
        payoff=results["payoff"],
    )


def score_script(
    script: str,
    model: str = "gpt-4o-mini",
    dimensions: tuple[str, ...] | None = None,
) -> JudgeScore:
    """
    Judge a script and return JudgeScore (engagement, clarity, payoff).
    """
    result = judge_script(script, model=model, dimensions=dimensions)
    if dimensions is not None and set(dimensions) != set(DIMENSIONS):
        # Return subset; build minimal JudgeScore with only requested dims
        stub = DimensionScore(passed=False, critique="", suggestion="", suggestion_reasoning="")
        return JudgeScore(
            engagement=result.engagement if "engagement" in dimensions else stub,
            clarity=result.clarity if "clarity" in dimensions else stub,
            payoff=result.payoff if "payoff" in dimensions else stub,
        )
    return result


def select_best(scores: list[JudgeScore]) -> int:
    """
    Given a list of JudgeScores (one per sample), return index of best.
    Primary: most passes wins.
    Tie-break: engagement > clarity > payoff (per DIMENSIONS order), then first sample.
    """
    if not scores:
        raise ValueError("No scores to select from")

    def _sort_key(i: int) -> tuple:
        s = scores[i]
        pass_count = sum(1 for d in DIMENSIONS if getattr(s, d).passed)
        dim_passes = tuple(getattr(s, d).passed for d in DIMENSIONS)
        # Final tie-break: prefer first sample (-i so smaller index wins)
        return (pass_count, *dim_passes, -i)

    return max(range(len(scores)), key=_sort_key)
