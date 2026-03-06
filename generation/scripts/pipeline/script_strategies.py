"""
Script generation strategies: Iterative (revise with feedback, preserve passing dims) vs Parallel (N samples, pick best).
"""

from __future__ import annotations

from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Protocol, runtime_checkable

from models import JudgeAttempt, JudgeScore


@runtime_checkable
class ScriptGenerationStrategy(Protocol):
    """Protocol for script generation strategies."""

    def run(self, ctx: ScriptContext) -> list[JudgeAttempt]:
        """Generate and judge script(s), return attempts."""
        ...

from pipeline.script_judge import score_script
from logger import info


DIMENSIONS = ("engagement", "clarity", "payoff")

GenerateFn = Callable[[list[dict], str, float], str]


@dataclass
class ScriptContext:
    """Context passed to script generation strategies."""

    raw_content: str
    system_prompt: str
    model: str
    temperature: float
    judge_model: str
    judge_gate: bool
    judge_max_retries: int
    judge_samples: int
    generate_fn: GenerateFn


def _format_judge_score(judge: JudgeScore) -> str:
    """Format judge score for logging: e.g. engagement=pass clarity=fail payoff=pass."""
    return " ".join(
        f"{d}={('pass' if getattr(judge, d).passed else 'fail')}"
        for d in DIMENSIONS
    )


def _format_judge_feedback(judge: JudgeScore) -> str:
    """Format failed dimensions' critique (primary) and suggestion (secondary) for use in revision prompt."""
    parts: list[str] = []
    for dim, data in [(d, getattr(judge, d)) for d in DIMENSIONS]:
        if data.passed:
            continue
        lines = [f"**{dim.title()}**"]
        if data.critique:
            lines.append(f"Critique: {data.critique}")
        if data.suggestion:
            lines.append(f"(One possible approach: {data.suggestion})")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def _build_revision_prompt(script: str, judge: JudgeScore) -> str:
    """Build revision prompt with preserve-passing instruction to reduce regressions."""
    passed_dims = [d for d in DIMENSIONS if getattr(judge, d).passed]
    failed_feedback = _format_judge_feedback(judge)

    preserve_instruction = ""
    if passed_dims:
        preserve_instruction = (
            f"IMPORTANT: The script PASSED these dimensions—do NOT alter them: {', '.join(passed_dims)}. "
            "Only revise what failed.\n\n"
        )

    return (
        f"A reviewer (smaller model) flagged these concerns. Use the critique to understand the issue; "
        f"address it in whatever way feels natural for the script. Do not adopt suggestions verbatim "
        "if they would make it sound stiff or over-edited.\n\n"
        f"{preserve_instruction}"
        f"Reviewer feedback:\n\n{failed_feedback}\n\n"
        "The revised script must still sound natural and spoken—like a real person explaining to a friend. "
        "Do not make it sound over-edited or like you're checking boxes.\n\n"
        "Output only the revised script, with the same structure ([HOOK], [BODY], [CLOSE] or similar)."
    )


def _initial_messages(ctx: ScriptContext) -> list[dict]:
    """Build initial user+system messages for script generation."""
    return [
        {"role": "system", "content": ctx.system_prompt},
        {"role": "user", "content": f"Here is the raw content to adapt:\n\n{ctx.raw_content}"},
    ]


class IterativeStrategy:
    """
    Generate one script, judge; if any dimension fails, revise with feedback.
    Uses preserve-passing instruction to reduce regressions when fixing failures.
    """

    def run(self, ctx: ScriptContext) -> list[JudgeAttempt]:
        max_iterations = ctx.judge_max_retries + 1 if ctx.judge_gate else 1
        attempts: list[JudgeAttempt] = []
        messages = _initial_messages(ctx)

        for attempt_num in range(max_iterations):
            script = ctx.generate_fn(messages, ctx.model, ctx.temperature)
            judge = score_script(script, model=ctx.judge_model)
            attempts.append(JudgeAttempt(script=script, judge=judge))

            all_pass = all(getattr(judge, d).passed for d in DIMENSIONS)
            score_str = _format_judge_score(judge)
            info(f"   📋 Attempt {attempt_num + 1}: Judge {'pass' if all_pass else 'fail'} ({score_str})")

            if all_pass:
                break

            if ctx.judge_gate and attempt_num < max_iterations - 1:
                revision_prompt = _build_revision_prompt(script, judge)
                messages.extend([
                    {"role": "assistant", "content": script},
                    {"role": "user", "content": revision_prompt},
                ])
                info(f"   ○ Retrying ({attempt_num + 2}/{max_iterations}) with judge feedback...")

        return attempts


class ParallelStrategy:
    """
    Generate N scripts in parallel from the same prompt. Judge all. No iteration.
    Eliminates regression by design—each script is independent.
    """

    def run(self, ctx: ScriptContext) -> list[JudgeAttempt]:
        n = ctx.judge_samples
        initial_messages = _initial_messages(ctx)
        attempts: list[JudgeAttempt] = []

        def _generate_one(_: int) -> JudgeAttempt:
            script = ctx.generate_fn(initial_messages, ctx.model, ctx.temperature)
            judge = score_script(script, model=ctx.judge_model)
            return JudgeAttempt(script=script, judge=judge)

        with ThreadPoolExecutor(max_workers=n) as ex:
            futures = {ex.submit(_generate_one, i): i for i in range(n)}
            for i, future in enumerate(as_completed(futures), 1):
                attempt = future.result()
                attempts.append(attempt)
                score_str = _format_judge_score(attempt.judge)
                all_pass = all(getattr(attempt.judge, d).passed for d in DIMENSIONS)
                info(f"   📋 Sample {i}/{n}: Judge {'pass' if all_pass else 'fail'} ({score_str})")

        return attempts


def select_strategy(judge_gate: bool, judge_samples: int) -> type[ScriptGenerationStrategy]:
    """
    Select strategy based on config.
    - judge_samples > 1: ParallelStrategy (generate N in parallel, pick best)
    - judge_samples == 1: IterativeStrategy (revise with feedback when judge_gate)
    """
    if judge_samples > 1:
        return ParallelStrategy
    return IterativeStrategy
