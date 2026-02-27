#!/usr/bin/env python3
"""
Run script judge on golden set and report agreement with human labels.
Run from project root: PYTHONPATH=generation/scripts python generation/scripts/eval/validate_judges.py
"""

import json
import sys
from pathlib import Path

from path_utils import project_root

# Import script judge (requires pipeline to be on path)
from pipeline.script_judge import score_script

GOLDEN_PATH = project_root() / "eval-ui" / "public" / "golden-set.json"
DIMS = ("engagement", "clarity", "payoff")


def main() -> None:
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

    for i, entry in enumerate(golden):
        script = entry.get("script", "")
        expected = entry.get("expected", {})
        trace_id = entry.get("traceId", "?")
        model = entry.get("model", "")

        try:
            result = score_script(script)
        except Exception as e:
            errors.append(f"{trace_id} ({model}): {e}")
            continue

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


if __name__ == "__main__":
    main()
