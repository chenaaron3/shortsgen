#!/usr/bin/env python3
"""
Generate a short video script from raw content using an LLM.
Called by run_pipeline. Outputs to cache/{config_hash}/videos/{cache_key}/script.md.
When judge is enabled, writes script-judge-results.json with engagement/clarity/payoff scores.
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

from pipeline.script_judge import score_script, select_best

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


def _format_judge_score(judge: JudgeScore) -> str:
    """Format judge score for logging: e.g. engagement=pass clarity=fail payoff=pass."""
    return " ".join(
        f"{d}={('pass' if getattr(judge, d).passed else 'fail')}"
        for d in ("engagement", "clarity", "payoff")
    )


def _format_judge_feedback(judge: JudgeScore) -> str:
    """Format failed dimensions' critique and suggestion for use in revision prompt."""
    parts: list[str] = []
    for dim, data in [("engagement", judge.engagement), ("clarity", judge.clarity), ("payoff", judge.payoff)]:
        if data.passed:
            continue
        lines = [f"**{dim.title()}**"]
        if data.critique:
            lines.append(f"Critique: {data.critique}")
        if data.suggestion:
            lines.append(f"Suggestion: {data.suggestion}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


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
    When judge_gate: retries until all pass or max_retries; logs each attempt with script + judge feedback.
    """
    step_start("Script")
    script_path = video_cache_path(cache_key, config_hash, "script.md")
    results_path = video_cache_path(cache_key, config_hash, "script-judge-results.json")
    judge_model = config.script.judge_model or DEFAULT_JUDGE_MODEL
    judge_gate = config.script.judge_gate
    max_retries = config.script.judge_max_retries

    if not skip_cache and script_path.exists():
        cache_hit(script_path)
        script = script_path.read_text(encoding="utf-8")
        step_end("Script", outputs=[script_path], cache_hits=1, cache_misses=0)
        return script

    cache_miss("generating...")
    system_prompt = _load_system_prompt(config.script.system_prompt)
    temperature = config.script.temperature if config.script.temperature is not None else 0.7

    def _initial_messages() -> list[dict]:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Here is the raw content to adapt:\n\n{raw_content}"},
        ]

    max_iterations = max_retries + 1 if judge_gate else 1
    attempts: list[JudgeAttempt] = []
    messages = _initial_messages()

    for attempt_num in range(max_iterations):
        script = _generate_script(messages, config.script.model, temperature)
        judge = score_script(script, model=judge_model)
        attempts.append(JudgeAttempt(script=script, judge=judge))
        all_pass = judge.engagement.passed and judge.clarity.passed and judge.payoff.passed
        score_str = _format_judge_score(judge)
        info(f"   📋 Attempt {attempt_num + 1}: Judge {'pass' if all_pass else 'fail'} ({score_str})")
        if all_pass:
            break
        if judge_gate and attempt_num < max_retries:
            feedback = _format_judge_feedback(judge)
            messages.extend([
                {"role": "assistant", "content": script},
                {
                    "role": "user",
                    "content": f"The script did not pass quality criteria. Please revise it to address the following feedback:\n\n{feedback}\n\nOutput only the revised script, with the same structure ([HOOK], [BODY], [CLOSE] or similar).",
                },
            ])
            info(f"   ○ Retrying ({attempt_num + 2}/{max_iterations}) with judge feedback...")

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
        all_pass = attempts[0].judge.engagement.passed and attempts[0].judge.clarity.passed and attempts[0].judge.payoff.passed
        info(f"   📋 Judge: {'pass' if all_pass else 'fail'} -> {results_path.name}")

    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(script, encoding="utf-8")
    step_end("Script", outputs=[script_path, results_path], cache_hits=0, cache_misses=1)
    return script
