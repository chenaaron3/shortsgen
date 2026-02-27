#!/usr/bin/env python3
"""
Create a temporary directory and write one file per trace from eval-dataset.json.
Each file contains traceId, title, and parsed [HOOK], [BODY], [CLOSE] so the agent
can read and evaluate one script at a time.
Run from project root. Output: eval-ui/.eval-scripts/
"""

import json
import re
import sys
from pathlib import Path

# Project root = 4 levels up from this script
PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATASET_PATH = PROJECT_ROOT / "eval-ui" / "public" / "eval-dataset.json"
OUTPUT_DIR = PROJECT_ROOT / "eval-ui" / ".eval-scripts"
JUDGMENTS_DIR = OUTPUT_DIR / "judgments"


def parse_script(script: str) -> dict[str, str]:
    """Parse [PLANNING], [HOOK], [BODY], [CLOSE] from script text. Matches eval-ui parseScript.ts."""
    stripped = re.sub(r"^```\s*\n?|\n?```\s*$", "", script).strip()
    planning = ""
    hook = ""
    body = ""
    close = ""
    m = re.search(r"\[PLANNING\]\s*\n?([\s\S]*?)(?=\[HOOK\]|$)", stripped, re.I)
    if m:
        planning = m.group(1).strip()
    m = re.search(r"\[HOOK\]\s*\n?([\s\S]*?)(?=\[BODY\]|$)", stripped, re.I)
    if m:
        hook = m.group(1).strip()
    m = re.search(r"\[BODY\]\s*\n?([\s\S]*?)(?=\[CLOSE\]|$)", stripped, re.I)
    if m:
        body = m.group(1).strip()
    m = re.search(r"\[CLOSE\]\s*\n?([\s\S]*)$", stripped, re.I)
    if m:
        close = m.group(1).strip()
    return {"planning": planning, "hook": hook, "body": body, "close": close}


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0  # 0 = all

    if not DATASET_PATH.exists():
        print(f"Error: {DATASET_PATH} not found", file=sys.stderr)
        sys.exit(1)

    with open(DATASET_PATH) as f:
        traces = json.load(f)

    if limit > 0:
        traces = traces[:limit]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JUDGMENTS_DIR.mkdir(parents=True, exist_ok=True)

    for t in traces:
        trace_id = t["id"]
        title = t.get("title", "")
        scripts = t.get("script", {})
        if isinstance(scripts, dict):
            script_items = list(scripts.items())
        else:
            script_items = [("", scripts)] if scripts else []

        for model, script in script_items:
            parsed = parse_script(script or "")
            fname = f"{trace_id}__{model}.txt" if model else f"{trace_id}.txt"
            path = OUTPUT_DIR / fname
            with open(path, "w") as f:
                f.write(f"traceId: {trace_id}\n")
                if model:
                    f.write(f"model: {model}\n")
                f.write(f"title: {title}\n\n")
                if parsed["planning"]:
                    f.write("--- PLANNING ---\n")
                    f.write(parsed["planning"] + "\n\n")
                f.write("--- HOOK ---\n")
                f.write(parsed["hook"] or "(empty)\n")
                f.write("\n--- BODY ---\n")
                f.write(parsed["body"] or "(empty)\n")
                f.write("\n--- CLOSE ---\n")
                f.write(parsed["close"] or "(empty)\n")
            print(path.relative_to(PROJECT_ROOT))

    print(f"\nWrote {len(traces)} script files to {OUTPUT_DIR.relative_to(PROJECT_ROOT)}")
    print("Judgment output: one JSON file per trace in", JUDGMENTS_DIR.relative_to(PROJECT_ROOT))


if __name__ == "__main__":
    main()
