#!/usr/bin/env python3
"""
Build eval dataset from source breakdowns. Scans cache/_breakdowns/*/breakdown.json,
reads script from cache/{cache_key}/script.md, emits eval-ui/public/eval-dataset.json.

Usage:
  python generation/scripts/eval/build_eval_dataset.py
"""

import json
import sys
from pathlib import Path

from path_utils import cache_base, cache_path, project_root


def build_eval_dataset() -> list[dict]:
    """Scan breakdowns and build eval traces. Returns list of EvalTrace dicts."""
    breakdowns_dir = cache_base() / "_breakdowns"
    if not breakdowns_dir.exists():
        return []

    traces: list[dict] = []
    for breakdown_path in breakdowns_dir.glob("*/breakdown.json"):
        try:
            data = json.loads(breakdown_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: skipping {breakdown_path}: {e}", file=sys.stderr)
            continue

        for nugget in data.get("nuggets", []):
            cache_key = nugget.get("cache_key")
            if not cache_key:
                continue

            script_path = cache_path(cache_key, "script.md")
            if not script_path.exists():
                continue

            try:
                script = script_path.read_text(encoding="utf-8")
            except OSError as e:
                print(f"Warning: skipping {cache_key}: {e}", file=sys.stderr)
                continue

            src = nugget.get("source_ref") or {}
            source_ref = None
            if isinstance(src, dict):
                parts = []
                if src.get("chapter"):
                    parts.append(f"Ch {src['chapter']}")
                if src.get("section"):
                    parts.append(src["section"])
                if parts:
                    source_ref = " · ".join(parts)

            traces.append({
                "id": cache_key,
                "nuggetId": nugget.get("id", ""),
                "title": nugget.get("title", ""),
                "rawContent": nugget.get("summary", ""),
                "script": script,
                "sourceRef": source_ref,
            })

    return traces


def main():
    traces = build_eval_dataset()
    out_dir = project_root() / "eval-ui" / "public"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "eval-dataset.json"
    out_path.write_text(json.dumps(traces, indent=2), encoding="utf-8")
    print(f"Wrote {len(traces)} traces to {out_path}")


if __name__ == "__main__":
    main()
