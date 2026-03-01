#!/usr/bin/env python3
"""
Run script judge on golden set and report agreement with human labels.
Writes judge-results.json for the eval UI to show disagreements.

Run from project root: PYTHONPATH=generation/scripts python generation/scripts/eval/validate_judges.py
  validate_judges.py --model gpt-4o   # use stronger model for 75%%+ alignment (default: gpt-4o-mini)
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
JUDGE_RESULTS_PATH = project_root() / "eval-ui" / "public" / "judge-results.json"
DIMS = ("engagement", "clarity", "payoff")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate script judge against golden set")
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model for judge (default: gpt-4o-mini; use --model gpt-4o for 75%%+ alignment)")
    args = parser.parse_args()

    if not GOLDEN_PATH.exists():
        print(f"Error: {GOLDEN_PATH} not found. Run export_golden_set.py first.", file=sys.stderr)
        sys.exit(1)

    with open(GOLDEN_PATH) as f:
        golden = json.load(f)

    if not golden:
        print("Golden set is empty.", file=sys.stderr)
        sys.exit(1)

    # Per-dimension: { dim: { "agree": n, "disagree": n } }
    stats = {d: {"agree": 0, "disagree": 0} for d in DIMS}
    errors = []
    results: list[dict] = []

    def process_entry(item: tuple[int, dict]) -> tuple[int, dict | None, str | None]:
        """Process one golden-set entry. Returns (index, result_dict, error_msg)."""
        i, entry = item
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
        # Only include suggestions for failed dimensions
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
            "expected": expected,
            "predicted": {d: predicted[d] for d in DIMS if predicted.get(d) is not None},
            "critiques": critiques,
            "disagreements": disagreements,
        }
        if suggestions:
            entry_data["suggestions"] = suggestions
        if suggestion_reasonings:
            entry_data["suggestionReasons"] = suggestion_reasonings

        return (i, {"result": result, "entry": entry_data}, None)

    items = list(enumerate(golden))
    with ThreadPoolExecutor(max_workers=min(32, len(items))) as ex:
        futures = {ex.submit(process_entry, item): item[0] for item in items}
        completed: dict[int, tuple[dict | None, str | None]] = {}
        for future in as_completed(futures):
            i, result_data, err = future.result()
            completed[i] = (result_data, err)

    # Reconstruct in original order, aggregate stats
    for i in range(len(golden)):
        result_data, err = completed[i]
        if err:
            errors.append(err)
            continue
        assert result_data is not None
        result = result_data["result"]
        entry_data = result_data["entry"]
        expected = entry_data["expected"]

        results.append(entry_data)

        for dim in DIMS:
            exp = expected.get(dim)
            if exp is None:
                continue
            got = result.get(dim, {}).get("pass")
            if got == exp:
                stats[dim]["agree"] += 1
            else:
                stats[dim]["disagree"] += 1

    # Report
    print("Judge vs human agreement:")
    print("| Dimension  | Agree | Disagree | Agreement % |")
    print("|------------|-------|----------|-------------|")
    for dim in DIMS:
        a, d = stats[dim]["agree"], stats[dim]["disagree"]
        total = a + d
        pct = round(100 * a / total) if total else 0
        print(f"| {dim:<10} | {a:>5} | {d:>8} | {pct:>10}% |")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors[:10]:
            print(f"  - {e}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")

    if results:
        output = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "model": args.model,
            "entries": results,
        }
        JUDGE_RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        JUDGE_RESULTS_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
        disagreement_count = sum(1 for r in results if r["disagreements"])
        print(f"\nExported {len(results)} judge results ({args.model}) -> {JUDGE_RESULTS_PATH.relative_to(project_root())}")
        print(f"  {disagreement_count} entries with ≥1 disagreement (view in eval UI with Disagreements filter)")


if __name__ == "__main__":
    main()
