#!/usr/bin/env python3
"""Print pass/fail breakdown table from llm-annotations.json. Run from project root."""

import json
import sys
from pathlib import Path

# Script is at .cursor/skills/script-eval-llm-annotate/scripts/breakdown.py → project root = parents[4]
DEFAULT_PATH = Path(__file__).resolve().parents[4] / "eval-ui" / "public" / "llm-annotations.json"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_absolute():
        # Assume project root is cwd
        path = Path.cwd() / path
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)

    with open(path) as f:
        data = json.load(f)

    dims = ("hook", "body", "ending")
    counts = {d: {"pass": 0, "fail": 0} for d in dims}

    for entry in data:
        for j in entry.get("judgments", []):
            d = j.get("dimension")
            if d in counts:
                counts[d]["pass" if j.get("pass") else "fail"] += 1

    total = len(data)
    print("| Dimension | Pass | Fail | Pass % |")
    print("|-----------|------|------|--------|")
    for d in dims:
        p, f = counts[d]["pass"], counts[d]["fail"]
        pct = round(100 * p / (p + f)) if (p + f) else 0
        label = d.capitalize()
        print(f"| {label:<9} | {p:>4} | {f:>4} | {pct:>5}% |")


if __name__ == "__main__":
    main()
