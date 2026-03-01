"""Add Improvement Pill videos (by view rank) to eval-dataset.json.
Reads ranking from source/data.json, scripts from generation/references/improvementpill/."""

import hashlib
import json
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def extract_script_content(md_path: Path) -> str:
    """Extract script from .md file (content between ```)."""
    text = md_path.read_text(encoding="utf-8")
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("\n"):
            text = text[1:]
    return text.strip()


def main():
    root = project_root()
    data_path = root / "source" / "data.json"
    ref_dir = root / "generation" / "references" / "improvementpill"
    out_path = root / "eval-ui" / "public" / "eval-dataset.json"

    with open(data_path) as f:
        data = json.load(f)
    videos = data["ImprovementPill"]["videos"]

    # Videos 11-25 (indices 10-24)
    target = videos[10:25]

    entries = []
    for v in target:
        vid = v["id"]
        nuggetId = f"improvement-pill-{vid}"
        entry_id = hashlib.sha256(nuggetId.encode()).hexdigest()[:16]

        md_path = ref_dir / f"{vid}.md"
        if not md_path.exists():
            print(f"Warning: missing {md_path}")
            continue

        script_content = extract_script_content(md_path)

        entries.append({
            "id": entry_id,
            "nuggetId": nuggetId,
            "title": v["title"],
            "rawContent": v["transcript"],
            "script": {"default": script_content},
            "sourceRef": f"Improvement Pill · https://www.youtube.com/watch?v={vid}",
            "sourceType": "youtube",
            "createdAt": 1772400000000,
            "assets": {"default": "default"},
        })

    existing = []
    if out_path.exists():
        existing = json.loads(out_path.read_text(encoding="utf-8"))

    existing_ids = {e["id"] for e in existing}
    new_entries = [e for e in entries if e["id"] not in existing_ids]
    if not new_entries:
        print("All entries already present")
        return

    merged = existing + new_entries
    out_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print(f"Added {len(new_entries)} Improvement Pill entries (ranks 11-25)")


if __name__ == "__main__":
    main()
