"""Collect script-judge-results.json from generation/cache/default into a single JSON output.
Deduplicates by cacheKey."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Run from project root; path_utils resolves relative to generation/scripts
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from path_utils import project_root


def find_script_judge_results(default_cache: Path) -> list[tuple[str, Path]]:
    """Find all script-judge-results.json under cache/default/videos. Returns [(cache_key, path), ...]."""
    results: list[tuple[str, Path]] = []
    videos_dir = default_cache / "videos"
    if not videos_dir.exists():
        return results
    for path in videos_dir.rglob("script-judge-results.json"):
        try:
            rel = path.relative_to(videos_dir)
            parts = rel.parts
            # {cache_key}/script-judge-results.json
            if len(parts) == 2 and parts[1] == "script-judge-results.json":
                cache_key = parts[0]
                results.append((cache_key, path))
        except (ValueError, IndexError):
            pass
    return results


def main() -> None:
    root = project_root()
    default_cache = root / "generation" / "cache" / "default"
    found = find_script_judge_results(default_cache)

    # Deduplicate by cache_key
    seen: dict[str, Path] = {}
    for cache_key, path in found:
        if cache_key not in seen:
            seen[cache_key] = path

    collected: list[dict] = []
    for cache_key, path in sorted(seen.items()):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: skip {path}: {e}", file=sys.stderr)
            continue
        collected.append({
            "cacheKey": cache_key,
            "attempts": data.get("attempts", []),
            "selectedIndex": data.get("selectedIndex"),
        })

    out = {
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(collected),
        "results": collected,
    }

    out_path = root / "eval-ui" / "public" / "script-judge-results-collected.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Collected {len(collected)} script-judge-results -> {out_path.relative_to(root)}")


if __name__ == "__main__":
    main()
