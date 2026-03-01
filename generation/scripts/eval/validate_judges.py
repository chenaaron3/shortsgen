#!/usr/bin/env python3
"""
Run script judge on golden set and holdout set; report agreement.
Golden = starred traces with human labels. Holdout = non-starred with synthetic
labels (YouTube=pass, AI=fail). Compares both to detect overfitting.

Run from project root: python generation/scripts/run.py eval/validate_judges.py --model gpt-4o-mini
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from path_utils import project_root

# Import script judge (requires pipeline to be on path)
from pipeline.script_judge import score_script

GOLDEN_PATH = project_root() / "eval-ui" / "public" / "golden-set.json"
EVAL_DATASET_PATH = project_root() / "eval-ui" / "public" / "eval-dataset.json"
JUDGE_RESULTS_PATH = project_root() / "eval-ui" / "public" / "judge-results.json"
DIMS = ("engagement", "clarity", "payoff")


def _golden_key(entry: dict) -> str:
    return f"{entry.get('traceId', '')}::{entry.get('model') or 'default'}"


def _is_youtube_script(trace: dict) -> bool:
    """YouTube scripts = expected PASS (holdout). AI-generated = expected FAIL. Requires explicit sourceType."""
    return trace.get("sourceType") == "youtube"


def _normalize_script(script: object) -> dict[str, str]:
    if isinstance(script, str):
        return {"default": script}
    if isinstance(script, dict):
        return {k: str(v) for k, v in script.items() if isinstance(v, str)}
    return {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate script judge against golden and holdout sets")
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model for judge")
    args = parser.parse_args()

    if not GOLDEN_PATH.exists():
        print(f"Error: {GOLDEN_PATH} not found. Run export_golden_set.py or star traces in eval UI.", file=sys.stderr)
        sys.exit(1)

    with open(GOLDEN_PATH) as f:
        golden_list = json.load(f)

    if not golden_list:
        print("Golden set is empty.", file=sys.stderr)
        sys.exit(1)

    golden_keys = {_golden_key(e) for e in golden_list}

    # Build holdout: (traceId, model) from eval-dataset not in golden
    holdout_entries: list[dict] = []
    if EVAL_DATASET_PATH.exists():
        with open(EVAL_DATASET_PATH) as f:
            traces = json.load(f)
        for trace in traces:
            trace_id = trace.get("id") or trace.get("traceId", "?")
            script_obj = trace.get("script") or {}
            scripts = _normalize_script(script_obj)
            is_youtube = _is_youtube_script(trace)
            expected = {d: is_youtube for d in DIMS}
            for model, script_text in scripts.items():
                key = f"{trace_id}::{model or 'default'}"
                if key in golden_keys:
                    continue
                holdout_entries.append({
                    "traceId": trace_id,
                    "model": model or None,
                    "title": trace.get("title", ""),
                    "rawContent": trace.get("rawContent", ""),
                    "script": script_text,
                    "expected": expected,
                })

    all_entries: list[tuple[dict, str]] = []  # (entry, dataset)
    for e in golden_list:
        all_entries.append((e, "golden"))
    for e in holdout_entries:
        all_entries.append((e, "holdout"))

    golden_stats = {d: {"agree": 0, "disagree": 0} for d in DIMS}
    holdout_stats = {d: {"agree": 0, "disagree": 0} for d in DIMS}
    errors: list[str] = []
    results: list[dict] = []

    def process_entry(item: tuple[int, tuple[dict, str]]) -> tuple[int, dict | None, str | None]:
        i, (entry, dataset) = item
        script = entry.get("script", "")
        expected = entry.get("expected", {})
        trace_id = entry.get("traceId", "?")
        model = entry.get("model") or ""
        title = entry.get("title", "")

        try:
            result = score_script(script, model=args.model)
        except Exception as e:
            return (i, None, f"{trace_id} ({model}): {e}")

        predicted = {d: result.get(d, {}).get("pass") for d in DIMS}
        critiques = {d: result.get(d, {}).get("critique", "") for d in DIMS}
        suggestions = {
            d: result.get(d, {}).get("suggestion", "")
            for d in DIMS
            if not predicted.get(d) and result.get(d, {}).get("suggestion")
        }
        suggestion_reasonings = {
            d: result.get(d, {}).get("suggestion_reasoning", "")
            for d in DIMS
            if not predicted.get(d) and result.get(d, {}).get("suggestion_reasoning")
        }
        disagreements = [d for d in DIMS if expected.get(d) is not None and predicted.get(d) != expected.get(d)]

        entry_data: dict = {
            "traceId": trace_id,
            "model": model or None,
            "title": title,
            "dataset": dataset,
            "expected": expected,
            "predicted": {d: predicted[d] for d in DIMS if predicted.get(d) is not None},
            "critiques": critiques,
            "disagreements": disagreements,
        }
        if suggestions:
            entry_data["suggestions"] = suggestions
        if suggestion_reasonings:
            entry_data["suggestionReasons"] = suggestion_reasonings

        return (i, {"result": result, "entry": entry_data, "dataset": dataset}, None)

    items = list(enumerate(all_entries))
    with ThreadPoolExecutor(max_workers=min(32, len(items))) as ex:
        futures = {ex.submit(process_entry, item): item[0] for item in items}
        completed: dict[int, tuple[dict | None, str | None]] = {}
        for future in as_completed(futures):
            i, result_data, err = future.result()
            completed[i] = (result_data, err)

    for i in range(len(all_entries)):
        result_data, err = completed[i]
        if err:
            errors.append(err)
            continue
        assert result_data is not None
        result = result_data["result"]
        entry_data = result_data["entry"]
        dataset = result_data["dataset"]
        expected = entry_data["expected"]

        results.append(entry_data)
        stats = golden_stats if dataset == "golden" else holdout_stats

        for dim in DIMS:
            exp = expected.get(dim)
            if exp is None:
                continue
            got = result.get(dim, {}).get("pass")
            if got == exp:
                stats[dim]["agree"] += 1
            else:
                stats[dim]["disagree"] += 1

    def print_table(label: str, st: dict[str, dict]) -> None:
        print(f"\n{label}:")
        print("| Dimension  | Agree | Disagree | Agreement % |")
        print("|------------|-------|----------|-------------|")
        for dim in DIMS:
            a, d = st[dim]["agree"], st[dim]["disagree"]
            total = a + d
            pct = round(100 * a / total) if total else 0
            print(f"| {dim:<10} | {a:>5} | {d:>8} | {pct:>10}% |")

    print("Judge vs human agreement:")
    print_table("Golden (starred, human labels)", golden_stats)
    if holdout_entries:
        print_table("Holdout (non-starred, YouTube=pass AI=fail)", holdout_stats)

        # Overfitting warning
        golden_pcts = {
            d: round(100 * golden_stats[d]["agree"] / (golden_stats[d]["agree"] + golden_stats[d]["disagree"] or 1))
            for d in DIMS
        }
        holdout_pcts = {
            d: round(100 * holdout_stats[d]["agree"] / (holdout_stats[d]["agree"] + holdout_stats[d]["disagree"] or 1))
            for d in DIMS
        }
        avg_golden = sum(golden_pcts.values()) / 3
        avg_holdout = sum(holdout_pcts.values()) / 3
        if avg_golden - avg_holdout > 15:
            print("\nWarning: Golden agreement much higher than holdout - possible overfitting to golden set.")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors[:10]:
            print(f"  - {e}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")

    if results:
        def dim_stats(st: dict) -> dict:
            return {d: {"agree": st[d]["agree"], "disagree": st[d]["disagree"]} for d in DIMS}

        output: dict = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "model": args.model,
            "golden": dim_stats(golden_stats),
            "holdout": dim_stats(holdout_stats),
            "entries": results,
        }
        JUDGE_RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        JUDGE_RESULTS_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
        disagreement_count = sum(1 for r in results if r["disagreements"])
        print(f"\nExported {len(results)} judge results -> {JUDGE_RESULTS_PATH.relative_to(project_root())}")
        print(f"  {disagreement_count} entries with >=1 disagreement (view in eval UI)")

if __name__ == "__main__":
    main()
