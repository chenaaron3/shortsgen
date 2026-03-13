#!/usr/bin/env python3
"""
Generate a short video script from raw content using an LLM.
Called by run_pipeline. Outputs to cache/{config_hash}/videos/{cache_key}/script.md.
When judge is enabled, writes script-judge-results.json with engagement/clarity/payoff scores.
Uses strategy pattern: IterativeStrategy (revise with feedback) or ParallelStrategy (N samples, pick best).
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from config_loader import Config
from models import JudgeAttempt, JudgeScore, ScriptJudgeResults
from path_utils import env_path, prompts_dir, video_cache_path
from logger import cache_hit, cache_miss, error, info, step_end, step_start
from usage_trace import record_llm

from pipeline.script_judge import select_best
from pipeline.script_strategies import ScriptContext, select_strategy

load_dotenv(env_path())

DEFAULT_JUDGE_MODEL = "gpt-4o-mini"


def _load_system_prompt(prompt_filename: str) -> str:
    """Load the system prompt from the prompts directory."""
    prompt_path = prompts_dir() / prompt_filename
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
    return prompt_path.read_text(encoding="utf-8")


def _generate_script(
    messages: list[dict],
    model: str,
    temperature: float = 0.7,
) -> str:
    """Call the LLM to generate/revise a script. messages must include system + user (and optionally prior assistant/user for revision)."""
    try:
        response = completion(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Script", model, u.prompt_tokens, u.completion_tokens)
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)


def _write_judge_results(
    results_path: Path,
    judge_model: str,
    judge: JudgeScore,
    *,
    attempts: list[JudgeAttempt] | None = None,
    selected_index: int | None = None,
) -> None:
    """Write script-judge-results.json (single-result or multi-attempt format)."""
    all_pass = judge.engagement.passed and judge.clarity.passed and judge.payoff.passed
    out = ScriptJudgeResults(
        generatedAt=datetime.now(timezone.utc).isoformat(),
        judgeModel=judge_model,
        judge=judge,
        allPass=all_pass,
        attempts=attempts,
        selectedIndex=selected_index,
    )
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(out.model_dump_json(by_alias=True, indent=2), encoding="utf-8")


def run(
    raw_content: str,
    cache_key: str,
    config: Config,
    config_hash: str,
    skip_cache: bool = False,
) -> str:
    """
    Generate script from raw content. Uses cache if available.
    Output: cache/{config_hash}/videos/{cache_key}/script.md
    Strategy selection:
    - judge_samples > 1: ParallelStrategy (N scripts in parallel, pick best)
    - judge_samples == 1: IterativeStrategy (revise with feedback, preserve passing dims)
    """
    step_start("Script")
    script_path = video_cache_path(cache_key, config_hash, "script.md")
    results_path = video_cache_path(cache_key, config_hash, "script-judge-results.json")
    judge_model = config.script.judge_model or DEFAULT_JUDGE_MODEL
    temperature = config.script.temperature if config.script.temperature is not None else 0.7

    if not skip_cache and script_path.exists():
        cache_hit(script_path)
        script = script_path.read_text(encoding="utf-8")
        step_end("Script", outputs=[script_path], cache_hits=1, cache_misses=0)
        return script

    cache_miss("generating...")
    system_prompt = _load_system_prompt(config.script.system_prompt)

    ctx = ScriptContext(
        raw_content=raw_content,
        system_prompt=system_prompt,
        model=config.script.model,
        temperature=temperature,
        judge_model=judge_model,
        judge_gate=config.script.judge_gate,
        judge_max_retries=config.script.judge_max_retries,
        judge_samples=config.script.judge_samples,
        generate_fn=_generate_script,
    )

    strategy_cls = select_strategy(config.script.judge_gate, config.script.judge_samples)
    strategy = strategy_cls()
    attempts = strategy.run(ctx)

    best_idx = select_best([a.judge for a in attempts])
    script = attempts[best_idx].script
    _write_judge_results(
        results_path,
        judge_model,
        attempts[best_idx].judge,
        attempts=attempts if len(attempts) > 1 else None,
        selected_index=best_idx if len(attempts) > 1 else None,
    )

    if len(attempts) > 1:
        info(f"   📋 Judge: selected attempt {best_idx + 1} -> {results_path.name}")
    else:
        j = attempts[0].judge
        all_pass = j.engagement.passed and j.clarity.passed and j.payoff.passed
        info(f"   📋 Judge: {'pass' if all_pass else 'fail'} -> {results_path.name}")

    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(script, encoding="utf-8")
    step_end("Script", outputs=[script_path, results_path], cache_hits=0, cache_misses=1)
    return script
