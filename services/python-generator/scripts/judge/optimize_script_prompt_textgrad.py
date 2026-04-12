#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import textgrad as tg
from dotenv import load_dotenv
from litellm import completion

from dataset_split import build_dataset, split_dataset
from fs_source import GetLinks
from optimize_run_logger import OptimizeRunLogger
from parse_link import FsHtmlMarkdownParser
from path_utils import cache_base, env_path, prompts_dir, project_root
from pipeline.script_judge import score_script

DEFAULT_SEED_URLS = ["https://fs.blog/learning/", "https://fs.blog/first-principles/"]
DEFAULT_SEED_FILE = project_root() / "source" / "random" / "source.txt"
DEFAULT_PROMPT_PATH = prompts_dir() / "short-script-system-prompt.md"
DEFAULT_OUTPUT_PROMPT_PATH = prompts_dir() / "optimized" / "short-script-system-prompt.textgrad-pilot.md"


def _load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_judge_prompts() -> dict[str, str]:
    return {
        "engagement": _load_text(prompts_dir() / "eval" / "judge-script-engagement.md"),
        "clarity": _load_text(prompts_dir() / "eval" / "judge-script-clarity.md"),
        "payoff": _load_text(prompts_dir() / "eval" / "judge-script-payoff.md"),
    }


def _generate_script(prompt_text: str, raw_content: str, model: str, temperature: float) -> str:
    response = completion(
        model=model,
        messages=[
            {"role": "system", "content": prompt_text},
            {"role": "user", "content": raw_content},
        ],
        temperature=temperature,
    )
    choices = getattr(response, "choices", None)
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", "") if message is not None else ""
    return str(content or "").strip()


def _clean_script_for_judging(script: str) -> str:
    """
    Keep judging focused on spoken output, not formatting scaffolding.
    """
    text = str(script or "").strip()
    text = text.replace("```", "")
    text = re.sub(r"(?im)^\s*\[(PLANNING|HOOK|BODY|CLOSE)\]\s*$", "", text)
    text = re.sub(r"(?im)^\s*\*\*(HOOK|BODY|CLOSE|PLANNING)\*\s*:\s*", "", text)
    text = re.sub(r"(?im)^\s*(HOOK|BODY|CLOSE|PLANNING)\s*:\s*", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _judge_summary(script: str, judge_model: str, judge_passes: int) -> tuple[dict[str, bool], dict[str, str]]:
    per_dim_votes: dict[str, int] = {"engagement": 0, "clarity": 0, "payoff": 0}
    critiques_pool: dict[str, list[str]] = {"engagement": [], "clarity": [], "payoff": []}
    clean_script = _clean_script_for_judging(script)
    runs = max(1, int(judge_passes))
    for _ in range(runs):
        score = score_script(clean_script, model=judge_model)
        dim_results = {
            "engagement": score.engagement,
            "clarity": score.clarity,
            "payoff": score.payoff,
        }
        for dim, result in dim_results.items():
            if result.passed:
                per_dim_votes[dim] += 1
            critiques_pool[dim].append(result.critique)

    passed = {dim: per_dim_votes[dim] >= ((runs // 2) + 1) for dim in per_dim_votes}
    critiques = {dim: " | ".join(critiques_pool[dim]) for dim in critiques_pool}
    return passed, critiques


def _weighted_pass_score(passed: dict[str, bool], weights: dict[str, float]) -> float:
    return sum((1.0 if passed[dim] else 0.0) * weights[dim] for dim in weights)


def _aggregate_metrics(records: list[dict]) -> dict[str, float]:
    if not records:
        return {
            "engagement_pass_rate": 0.0,
            "clarity_pass_rate": 0.0,
            "payoff_pass_rate": 0.0,
            "joint_pass_rate": 0.0,
            "avg_weighted_score": 0.0,
        }
    n = len(records)
    engagement = sum(1 for r in records if r["passed"]["engagement"]) / n
    clarity = sum(1 for r in records if r["passed"]["clarity"]) / n
    payoff = sum(1 for r in records if r["passed"]["payoff"]) / n
    joint = sum(1 for r in records if all(r["passed"].values())) / n
    avg_score = sum(r["weighted_score"] for r in records) / n
    return {
        "engagement_pass_rate": round(100 * engagement, 2),
        "clarity_pass_rate": round(100 * clarity, 2),
        "payoff_pass_rate": round(100 * payoff, 2),
        "joint_pass_rate": round(100 * joint, 2),
        "avg_weighted_score": round(avg_score, 4),
    }


def _gate_pass(
    baseline_val: dict[str, float],
    candidate_val: dict[str, float],
    clarity_regression_tolerance: float,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if candidate_val["clarity_pass_rate"] - baseline_val["clarity_pass_rate"] < -clarity_regression_tolerance:
        reasons.append("clarity regression beyond tolerance")
    if candidate_val["engagement_pass_rate"] < baseline_val["engagement_pass_rate"]:
        reasons.append("engagement regressed")
    if candidate_val["payoff_pass_rate"] < baseline_val["payoff_pass_rate"]:
        reasons.append("payoff regressed")
    return (len(reasons) == 0), reasons


def _build_loss_instruction(judge_prompts: dict[str, str]) -> str:
    return (
        "You are a strict prompt-optimizer critic.\n"
        "Evaluate generated scripts with these three judge criteria.\n"
        "Suggest reusable prompt-level improvements only.\n\n"
        f"[ENGAGEMENT JUDGE]\n{judge_prompts['engagement']}\n\n"
        f"[CLARITY JUDGE]\n{judge_prompts['clarity']}\n\n"
        f"[PAYOFF JUDGE]\n{judge_prompts['payoff']}\n"
    )


def _build_optimization_loss_instructions() -> dict[str, str]:
    """
    Lightweight optimization rubrics for TextGrad backward pass.
    Keep these short and focused; full judge prompts are used for gating.
    """
    return {
        "engagement": (
            "You are optimizing a system prompt for short-form scripts.\n"
            "Critique ONLY engagement quality in this script.\n"
            "Focus on hook strength: specific open loop, clear reason to keep watching.\n"
            "Ban generic opener templates (e.g., 'Most people...', 'We all...', 'Ever feel...').\n"
            "Require a concrete promise or surprising specific claim in the first line.\n"
            "Require that the first line implies a clear payoff by the end of the script.\n"
            "Return 2-4 concise prompt-level edits (not script rewrites)."
        ),
        "clarity": (
            "You are optimizing a system prompt for short-form scripts.\n"
            "Critique ONLY clarity in this script.\n"
            "Require at least one concrete anchor and easy one-listen flow with simple wording.\n"
            "Return 2-4 concise prompt-level edits (not script rewrites)."
        ),
        "payoff": (
            "You are optimizing a system prompt for short-form scripts.\n"
            "Critique ONLY payoff quality in this script.\n"
            "Require concrete actionable value: a specific action, mechanism, or practical takeaway.\n"
            "Reject abstract mindset-only endings without a concrete next step.\n"
            "Require the close to include one concrete action with context (when/where/how).\n"
            "Return 2-4 concise prompt-level edits (not script rewrites)."
        ),
    }


def _prompt_violates_invariants(prompt_text: str) -> tuple[bool, list[str]]:
    required_markers = [
        "[PLANNING]",
        "[HOOK]",
        "[BODY]",
        "[CLOSE]",
        "No question hooks.",
    ]
    missing = [marker for marker in required_markers if marker not in prompt_text]
    return (len(missing) > 0), missing


def _build_backward_engine(model_name: str, max_tokens: int):
    """
    Force a larger output budget for TextGrad optimizer rewrites.
    """
    engine = tg.get_engine(model_name)
    original_generate = engine.generate

    def _generate_with_budget(content, system_prompt=None, **kwargs):
        kwargs.setdefault("max_tokens", max_tokens)
        return original_generate(content, system_prompt=system_prompt, **kwargs)

    engine.generate = _generate_with_budget  # type: ignore[attr-defined]
    return engine


def main() -> None:
    parser = argparse.ArgumentParser(description="Optimize short-script prompt with TextGrad")
    parser.add_argument("--prompt-path", type=Path, default=DEFAULT_PROMPT_PATH)
    parser.add_argument("--output-prompt-path", type=Path, default=DEFAULT_OUTPUT_PROMPT_PATH)
    parser.add_argument("--writer-model", default="gpt-4o-mini")
    parser.add_argument("--judge-model", default="gpt-4o-mini")
    parser.add_argument("--backward-model", default="gpt-4o-mini")
    parser.add_argument("--backward-max-tokens", type=int, default=8000)
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--train-temperature", type=float, default=0.7)
    parser.add_argument("--eval-temperature", type=float, default=0.2)
    parser.add_argument("--judge-passes", type=int, default=2)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--feedback-samples", type=int, default=8)
    parser.add_argument("--max-backward-calls", type=int, default=12)
    parser.add_argument("--target-count", type=int, default=40)
    parser.add_argument("--train-count", type=int, default=28)
    parser.add_argument("--val-count", type=int, default=8)
    parser.add_argument("--test-count", type=int, default=4)
    parser.add_argument("--min-words", type=int, default=250)
    parser.add_argument("--max-words", type=int, default=900)
    parser.add_argument("--fs-topup-limit", type=int, default=24)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--clarity-tolerance", type=float, default=2.0)
    parser.add_argument("--strong-baseline-threshold", type=float, default=0.9)
    parser.add_argument("--stop-on-improvement", action="store_true", default=True)
    parser.add_argument("--no-stop-on-improvement", action="store_false", dest="stop_on_improvement")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(env_path())
    if args.train_count + args.val_count + args.test_count != args.target_count:
        raise ValueError("train_count + val_count + test_count must equal target_count")
    if not args.prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found: {args.prompt_path}")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_root = cache_base() / "judge" / "textgrad-prompt-opt" / run_id
    run_logger = OptimizeRunLogger(output_root)
    run_logger.info(f"[run] output directory: {output_root}")

    units = build_dataset(
        target_count=args.target_count,
        min_words=args.min_words,
        max_words=args.max_words,
        seed_file=DEFAULT_SEED_FILE,
        seed_urls=DEFAULT_SEED_URLS,
        fs_topup_limit=args.fs_topup_limit,
        rng_seed=args.seed,
        link_source=GetLinks(),
        parser=FsHtmlMarkdownParser(),
    )
    splits = split_dataset(
        units,
        train_count=args.train_count,
        val_count=args.val_count,
        test_count=args.test_count,
    )
    run_logger.write_dataset(
        seed_urls=DEFAULT_SEED_URLS,
        seed_file=str(DEFAULT_SEED_FILE),
        target_count=args.target_count,
        min_words=args.min_words,
        max_words=args.max_words,
        splits=splits,
    )
    run_logger.info(f"[dataset] train={len(splits['train'])}, val={len(splits['val'])}, test={len(splits['test'])}")
    if args.dry_run:
        run_logger.info("[dry-run] dataset prepared; skipping LLM optimization.")
        return

    prompt_text = _load_text(args.prompt_path)
    judge_prompts = _load_judge_prompts()
    weights = {"engagement": 0.45, "payoff": 0.35, "clarity": 0.20}

    def evaluate_split(split_name: str, prompt: str) -> tuple[list[dict], dict[str, float]]:
        records: list[dict] = []
        total = len(splits[split_name])
        for idx, unit in enumerate(splits[split_name], start=1):
            script = _generate_script(prompt, unit.text, args.writer_model, args.eval_temperature)
            passed, critiques = _judge_summary(script, judge_model=args.judge_model, judge_passes=args.judge_passes)
            records.append(
                {
                    "unit_id": unit.unit_id,
                    "source": unit.source,
                    "script": script,
                    "passed": passed,
                    "critiques": critiques,
                    "weighted_score": _weighted_pass_score(passed, weights),
                }
            )
            if idx == 1 or idx % 5 == 0 or idx == total:
                run_logger.info(f"[{split_name}] progress {idx}/{total}")
        return records, _aggregate_metrics(records)

    baseline_val_records, baseline_val_metrics = evaluate_split("val", prompt_text)
    baseline_test_records, baseline_test_metrics = evaluate_split("test", prompt_text)
    run_logger.write_baseline(
        prompt_text=prompt_text,
        val_metrics=baseline_val_metrics,
        test_metrics=baseline_test_metrics,
        val_records=baseline_val_records,
        test_records=baseline_test_records,
    )
    run_logger.info(f"[baseline] val_joint={baseline_val_metrics['joint_pass_rate']}% test_joint={baseline_test_metrics['joint_pass_rate']}%")

    backward_engine = _build_backward_engine(args.backward_model, args.backward_max_tokens)
    tg.set_backward_engine(backward_engine, override=True)
    loss_instructions = _build_optimization_loss_instructions()
    best_prompt = prompt_text
    best_val_metrics = baseline_val_metrics
    rounds_log: list[dict] = []

    for round_idx in range(1, args.rounds + 1):
        round_dir = run_logger.round_dir(round_idx)
        run_logger.info(f"[round {round_idx}] generating train scripts + judge scoring")

        prompt_var = tg.Variable(
            best_prompt,
            role_description="system prompt for short-form script generation",
            requires_grad=True,
        )
        writer = tg.BlackboxLLM(args.writer_model, system_prompt=prompt_var)
        optimizer = tg.TGD(parameters=[prompt_var])
        loss_fns = {dim: tg.TextLoss(instr) for dim, instr in loss_instructions.items()}

        train_records: list[dict] = []
        train_script_vars: dict[str, tg.Variable] = {}
        train_total = len(splits["train"])
        for idx, unit in enumerate(splits["train"], start=1):
            source_var = tg.Variable(unit.text, role_description="raw source content", requires_grad=False)
            script_var = writer(source_var)
            if script_var is None:
                continue
            script_text = str(script_var.value).strip()
            passed, critiques = _judge_summary(script_text, judge_model=args.judge_model, judge_passes=args.judge_passes)
            train_script_vars[unit.unit_id] = script_var
            train_records.append(
                {
                    "unit_id": unit.unit_id,
                    "source": unit.source,
                    "script": script_text,
                    "passed": passed,
                    "critiques": critiques,
                    "weighted_score": _weighted_pass_score(passed, weights),
                }
            )
            if idx == 1 or idx % 5 == 0 or idx == train_total:
                run_logger.info(f"[round {round_idx}] train progress {idx}/{train_total}")

        train_metrics = _aggregate_metrics(train_records)
        run_logger.write_round_train(
            round_dir,
            train_metrics=train_metrics,
            train_records=train_records,
        )

        failing = sorted(train_records, key=lambda r: r["weighted_score"])[: args.feedback_samples]
        backward_tasks: list[tuple[str, str, float, float]] = []
        for rec in train_records:
            for dim, passed in rec["passed"].items():
                if not passed:
                    backward_tasks.append((rec["unit_id"], dim, weights[dim], rec["weighted_score"]))
        dim_priority = {"engagement": 3, "payoff": 2, "clarity": 1}
        backward_tasks.sort(key=lambda t: (-dim_priority.get(t[1], 0), t[3], -t[2]))
        effective_max_backward_calls = args.max_backward_calls
        if (
            best_val_metrics.get("engagement_pass_rate", 0.0) >= 87.5
            and best_val_metrics.get("payoff_pass_rate", 0.0) >= 62.5
        ):
            effective_max_backward_calls = min(effective_max_backward_calls, 8)
        backward_tasks = backward_tasks[:effective_max_backward_calls]
        run_logger.info(
            f"[round {round_idx}] backward on {len(backward_tasks)} dimension-fail tasks "
            f"(max={effective_max_backward_calls}; from {len(train_records)} train examples; "
            f"{len(failing)} low-score refs)"
        )
        if hasattr(optimizer, "zero_grad"):
            optimizer.zero_grad()
        total_backward = len(backward_tasks)
        for idx, (unit_id, dim, _weight, _score) in enumerate(backward_tasks, start=1):
            script_var = train_script_vars[unit_id]
            loss = loss_fns[dim](script_var)
            if loss is not None:
                loss.backward()
            if idx == 1 or idx % 3 == 0 or idx == total_backward:
                run_logger.info(f"[round {round_idx}] backward progress {idx}/{total_backward}")
        strong_baseline = best_val_metrics["avg_weighted_score"] >= args.strong_baseline_threshold
        if strong_baseline:
            run_logger.info(
                f"[round {round_idx}] baseline strong ({best_val_metrics['avg_weighted_score']:.4f}); "
                "skipping risky optimizer step"
            )
            candidate_prompt = best_prompt
        else:
            run_logger.info(f"[round {round_idx}] optimizer step start")
            optimizer.step()
            run_logger.info(f"[round {round_idx}] optimizer step done")
            candidate_prompt = str(prompt_var.value)
            violates, missing = _prompt_violates_invariants(candidate_prompt)
            if violates:
                run_logger.info(
                    f"[round {round_idx}] candidate prompt dropped required invariants; "
                    f"missing={missing}. Reverting to best prompt."
                )
                candidate_prompt = best_prompt
        run_logger.save_prompt(round_dir / "candidate-prompt.md", candidate_prompt)
        run_logger.info(f"[round {round_idx}] eval start")
        if candidate_prompt.strip() == best_prompt.strip():
            val_records, val_metrics = baseline_val_records, baseline_val_metrics
            test_records, test_metrics = baseline_test_records, baseline_test_metrics
            run_logger.info(f"[round {round_idx}] candidate unchanged; reusing baseline eval metrics")
        else:
            val_records, val_metrics = evaluate_split("val", candidate_prompt)
            test_records, test_metrics = evaluate_split("test", candidate_prompt)
        gate_ok, gate_reasons = _gate_pass(best_val_metrics, val_metrics, args.clarity_tolerance)

        rounds_log.append(
            {
                "round": round_idx,
                "train_metrics": train_metrics,
                "val_metrics": val_metrics,
                "test_metrics": test_metrics,
                "gate_ok": gate_ok,
                "gate_reasons": gate_reasons,
            }
        )
        run_logger.write_round_eval(
            round_dir,
            round_idx=round_idx,
            gate_ok=gate_ok,
            gate_reasons=gate_reasons,
            val_metrics=val_metrics,
            test_metrics=test_metrics,
            val_records=val_records,
            test_records=test_records,
        )

        if gate_ok:
            best_prompt = candidate_prompt
            best_val_metrics = val_metrics
            run_logger.save_prompt(output_root / "prompts" / f"prompt.v{round_idx}.accepted.md", best_prompt)
            run_logger.info(f"[round {round_idx}] accepted improvement")
            if args.stop_on_improvement:
                run_logger.info(f"[round {round_idx}] stopping early after first accepted improvement")
                break

    run_logger.save_prompt(output_root / "prompts" / "prompt.best.md", best_prompt)
    run_logger.save_prompt(args.output_prompt_path, best_prompt)
    run_logger.write_summary(
        {
            "run_id": run_id,
            "writer_model": args.writer_model,
            "judge_model": args.judge_model,
            "backward_model": args.backward_model,
            "temperature": args.temperature,
            "weights": weights,
            "baseline_val_metrics": baseline_val_metrics,
            "baseline_test_metrics": baseline_test_metrics,
            "best_val_metrics": best_val_metrics,
            "rounds": rounds_log,
            "output_prompt_path": str(args.output_prompt_path),
        }
    )
    run_logger.info(f"[done] best prompt written to: {args.output_prompt_path}")
    run_logger.info(f"[done] full run artifacts at: {output_root}")


if __name__ == "__main__":
    main()
