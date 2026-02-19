#!/usr/bin/env python3
"""
Merge per-trace judgment files from eval-ui/.eval-scripts/judgments/ into
eval-ui/public/llm-annotations.json. Preserves trace order from eval-dataset.json.
Run from project root.
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATASET_PATH = PROJECT_ROOT / "eval-ui" / "public" / "eval-dataset.json"
JUDGMENTS_DIR = PROJECT_ROOT / "eval-ui" / ".eval-scripts" / "judgments"
OUTPUT_PATH = PROJECT_ROOT / "eval-ui" / "public" / "llm-annotations.json"


def main() -> None:
    if not DATASET_PATH.exists():
        print(f"Error: {DATASET_PATH} not found", file=sys.stderr)
        raise SystemExit(1)

    with open(DATASET_PATH) as f:
        traces = json.load(f)
    trace_ids = [t["id"] for t in traces]

    merged = []
    for trace_id in trace_ids:
        path = JUDGMENTS_DIR / f"{trace_id}.json"
        if not path.exists():
            print(f"Warning: missing {path.relative_to(PROJECT_ROOT)}", file=sys.stderr)
            continue
        with open(path) as f:
            entry = json.load(f)
        merged.append(entry)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(merged, f, indent=2)

    print(f"Merged {len(merged)} judgments -> {OUTPUT_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
