#!/usr/bin/env python3
"""
Export a golden set from eval-dataset.json and annotations.
Includes all human-reviewed traces with their expected pass/fail per dimension.
Use for judge validation and calibration.
Run from project root.
"""

import json
import sys
from pathlib import Path

from path_utils import project_root

DIMS = ("engagement", "clarity", "payoff")
DATASET_PATH = project_root() / "eval-ui" / "public" / "eval-dataset.json"
ANNOTATIONS_PATH = project_root() / "eval-ui" / "public" / "annotations.json"
OUTPUT_PATH = project_root() / "eval-ui" / "public" / "golden-set.json"


def annotation_key(trace_id: str, model: str) -> str:
    return f"{trace_id}::{model}" if model else f"{trace_id}::default"


def main() -> None:
    if not DATASET_PATH.exists():
        print(f"Error: {DATASET_PATH} not found", file=sys.stderr)
        sys.exit(1)

    annotations = {}
    if ANNOTATIONS_PATH.exists():
        try:
            data = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
            for a in data if isinstance(data, list) else []:
                key = annotation_key(a.get("traceId", ""), a.get("model", "") or "")
                if key:
                    annotations[key] = a
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: could not load annotations: {e}", file=sys.stderr)

    if not annotations:
        print("No human annotations found. Review traces in eval-ui and save first.", file=sys.stderr)
        sys.exit(1)

    with open(DATASET_PATH) as f:
        traces = json.load(f)

    golden = []
    for t in traces:
        trace_id = t["id"]
        scripts = t.get("script", {})
        if isinstance(scripts, dict):
            models = list(scripts.keys())
        else:
            models = ["default"] if scripts else []

        for model in models:
            key = annotation_key(trace_id, model)
            ann = annotations.get(key)
            if not ann or not ann.get("judgments"):
                continue

            judgments_by_dim = {j["dimension"]: j.get("pass") for j in ann["judgments"]}
            expected = {
                d: judgments_by_dim.get(d)
                for d in DIMS
                if judgments_by_dim.get(d) is not None
            }
            if len(expected) < len(DIMS):
                continue

            script_text = scripts.get(model, scripts) if isinstance(scripts, dict) else scripts
            golden.append({
                "traceId": trace_id,
                "model": model or None,
                "title": t.get("title", ""),
                "rawContent": t.get("rawContent", ""),
                "script": script_text,
                "expected": expected,
            })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(golden, indent=2), encoding="utf-8")
    print(f"Exported {len(golden)} golden entries -> {OUTPUT_PATH.relative_to(project_root())}")


if __name__ == "__main__":
    main()
