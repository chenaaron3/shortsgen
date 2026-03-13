#!/usr/bin/env python3
"""
Pairwise script judge: compare two scripts and pick the one that would perform better with viewers.

Uses a prompt-based LLM judge with inline few-shot examples.
Supports single comparison (--script-a, --script-b) or batch evaluation (--batch).

Usage:
  python generation/scripts/run.py judge/judge.py --script-a "..." --script-b "..."
  python generation/scripts/run.py judge/judge.py --batch path/to/pairwise.jsonl
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from models import PairwiseBatchOutput, PairwiseJudgeOutput, PairwiseJudgeResult
from path_utils import cache_base, env_path
from schema_utils import schema_for_openai

load_dotenv(env_path())

PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "pairwise-judge-system-prompt.md"
DEFAULT_MODEL = "gpt-4o-mini"


def _load_system_prompt() -> str:
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(f"Judge prompt not found at {PROMPT_PATH}")
    return PROMPT_PATH.read_text(encoding="utf-8")


def _judge_once(script_a: str, script_b: str) -> tuple[str, str]:
    """
    Single LLM call: compare scripts and return (winner, reason).
    winner is "A" or "B" in terms of the passed-in order.
    """
    system_prompt = _load_system_prompt()
    user_content = "Script A:\n" + script_a + "\n\nScript B:\n" + script_b + "\n\nWhich performs better?"

    schema = PairwiseJudgeOutput.model_json_schema()
    schema = schema_for_openai(schema)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "PairwiseJudgeOutput",
            "strict": True,
            "schema": schema,
        },
    }

    response = completion(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format=response_format,
        temperature=0.0,
    )
    raw = (response.choices[0].message.content or "").strip()
    parsed = PairwiseJudgeOutput.model_validate_json(raw)
    return parsed.winner, parsed.reason or ""


def judge_pair(
    script_a: str,
    script_b: str,
) -> tuple[str, str]:
    """
    Single comparison (A, B). For batch use judge_pair_order_swap_voting.
    """
    return _judge_once(script_a, script_b)


def judge_pair_order_swap_voting(
    script_a: str,
    script_b: str,
) -> tuple[str, str]:
    """
    Order-swap voting: run (A,B) and (B,A), map second back. If disagree, tiebreak.
    Returns (winner, reason) in original (script_a, script_b) terms.
    """
    pred1, reason1 = _judge_once(script_a, script_b)
    pred2, reason2 = _judge_once(script_b, script_a)
    pred2_mapped = "B" if pred2 == "A" else "A"

    if pred1 == pred2_mapped:
        return pred1, reason1

    # Tiebreak: run (A, B) again
    pred3, reason3 = _judge_once(script_a, script_b)
    votes = [pred1, pred2_mapped, pred3]
    winner = "A" if votes.count("A") >= 2 else "B"
    reason = reason3  # Use tiebreak call's reason
    return winner, reason


def run_batch(
    pairwise_path: Path,
    max_examples: int | None = None,
    max_workers: int = 100,
) -> PairwiseBatchOutput:
    """
    Evaluate judge on pairwise.jsonl. Returns accuracy and per-example results.
    Runs up to max_workers judge calls concurrently.
    """
    examples: list[dict] = []
    with open(pairwise_path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if max_examples and i >= max_examples:
                break
            try:
                examples.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    def _judge_one(idx_ex: tuple[int, dict]) -> tuple[int, PairwiseJudgeResult]:
        idx, ex = idx_ex
        pred, reason = judge_pair_order_swap_voting(
            ex["script_a"],
            ex["script_b"],
        )
        gold = ex.get("winner", "A")
        return idx, PairwiseJudgeResult(
            video_id_a=ex.get("video_id_a"),
            video_id_b=ex.get("video_id_b"),
            script_a=ex.get("script_a", ""),
            script_b=ex.get("script_b", ""),
            gold=gold,
            pred=pred,
            reason=reason or "",
            correct=pred == gold,
        )

    results_by_idx: dict[int, PairwiseJudgeResult] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(_judge_one, (i, e)): i for i, e in enumerate(examples)}
        for future in as_completed(futures):
            idx, result = future.result()
            results_by_idx[idx] = result

    results = [results_by_idx[i] for i in range(len(examples))]
    correct = sum(1 for r in results if r.correct)
    return PairwiseBatchOutput(
        accuracy=correct / len(examples) if examples else 0,
        correct=correct,
        total=len(examples),
        results=results,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pairwise script judge: compare two scripts or run batch evaluation"
    )
    parser.add_argument(
        "--script-a",
        type=str,
        help="First script text (for single comparison)",
    )
    parser.add_argument(
        "--script-b",
        type=str,
        help="Second script text (for single comparison)",
    )
    parser.add_argument(
        "--batch",
        type=Path,
        metavar="PATH",
        help="Path to pairwise.jsonl for batch evaluation",
    )
    parser.add_argument(
        "--max-examples",
        type=int,
        default=None,
        help="Max examples for batch eval (default: all)",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=100,
        help="Concurrent LLM calls for batch eval (default: 100)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Write batch results to JSON file (default: cache/judge/judge-results.json)",
    )
    args = parser.parse_args()

    if args.batch:
        print(f"Running judge on {args.batch}...", flush=True)
        out = run_batch(
            args.batch,
            max_examples=args.max_examples,
            max_workers=args.max_workers,
        )
        output_path = args.output or (cache_base() / "judge" / "judge-results.json")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(
                out.model_dump() | {"model": DEFAULT_MODEL},
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"Accuracy: {out.accuracy:.2%} ({out.correct}/{out.total})", flush=True)
        print(f"Results saved to {output_path}", flush=True)

        # Summary breakdown
        gold_a = [r for r in out.results if r.gold == "A"]
        gold_b = [r for r in out.results if r.gold == "B"]
        acc_a = sum(1 for r in gold_a if r.correct) / len(gold_a) if gold_a else 0
        acc_b = sum(1 for r in gold_b if r.correct) / len(gold_b) if gold_b else 0
        errors_pred_a = sum(1 for r in out.results if not r.correct and r.pred == "A")
        errors_pred_b = sum(1 for r in out.results if not r.correct and r.pred == "B")
        print("Summary breakdown:", flush=True)
        print(f"  Gold A: {acc_a:.2%} ({sum(1 for r in gold_a if r.correct)}/{len(gold_a)})", flush=True)
        print(f"  Gold B: {acc_b:.2%} ({sum(1 for r in gold_b if r.correct)}/{len(gold_b)})", flush=True)
        print(f"  Errors: {errors_pred_a} pred=A (gold was B), {errors_pred_b} pred=B (gold was A)", flush=True)
    elif args.script_a is not None and args.script_b is not None:
        winner, reason = judge_pair(
            args.script_a, args.script_b
        )
        print(winner)
        if reason:
            print(f"\nReason: {reason}")
    else:
        parser.error("Provide --script-a and --script-b for single comparison, or --batch for batch eval")


if __name__ == "__main__":
    main()
