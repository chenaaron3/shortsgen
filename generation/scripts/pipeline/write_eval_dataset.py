"""Build eval dataset from cached scripts. Reads from cache/_breakdown/ and cache/{config_name}/videos/.
Copies chunks, images, and video to eval-ui/public/eval-assets/ when available."""

import json
import shutil
import sys
from pathlib import Path

from path_utils import breakdown_cache_path, project_root, video_cache_path


def _format_source_ref(src) -> str | None:
    if not src or not isinstance(src, dict):
        return None
    parts = []
    if src.get("chapter"):
        parts.append(f"Ch {src['chapter']}")
    if src.get("section"):
        parts.append(src["section"])
    return " · ".join(parts) if parts else None


def _copy_assets(cache_key: str, config, assets_base: Path) -> bool:
    """Copy chunks, images, and video for a trace+config. Returns True if any assets were copied."""
    src_dir = video_cache_path(cache_key, config.hash, "")
    dst_dir = assets_base / cache_key / config.hash
    copied = False

    chunks_src = src_dir / "chunks.json"
    if chunks_src.exists():
        dst_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(chunks_src, dst_dir / "chunks.json")
        copied = True

    # Check images first, then images_prototype (for --prototype runs)
    for images_subdir in ("images", "images_prototype"):
        images_src = src_dir / images_subdir
        if images_src.exists() and images_src.is_dir():
            dst_images = dst_dir / "images"
            dst_images.mkdir(parents=True, exist_ok=True)
            for f in images_src.iterdir():
                if f.suffix.lower() in (".png", ".jpg", ".jpeg"):
                    shutil.copy2(f, dst_images / f.name)
                    copied = True
            break

    video_src = src_dir / "short.mp4"
    if video_src.exists():
        dst_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(video_src, dst_dir / "short.mp4")
        copied = True

    return copied


def write_eval_dataset(
    *,
    configs: list,
    source_hash_val: str | None = None,
    nuggets: list[dict] | None = None,
) -> Path:
    """
    Build eval traces from cached breakdowns and scripts, write to eval-ui/public/eval-dataset.json.
    Additive: loads existing traces, overwrites only those whose id matches this run's cache_keys, then appends new traces.
    script = {config_name: script_text}.
    When chunks/images/video exist, copies them to eval-ui/public/eval-assets/{cache_key}/{config_hash}/.
    Returns path to written file.

    Args:
        configs: Pipeline configs to gather scripts from.
        source_hash_val: If provided (and nuggets not), read nuggets from breakdown at cache/_breakdown/{hash}/.
        nuggets: If provided, use directly (e.g. run_pipeline single-content multi-config). Each dict needs
                 cache_key, summary, id, title; optional source_ref.
    """
    traces: list[dict] = []
    resolved_nuggets: list[dict] = []

    if nuggets is not None:
        resolved_nuggets = [n for n in nuggets if n.get("cache_key")]
    elif source_hash_val is not None:
        breakdown_path = breakdown_cache_path(source_hash_val)
        if not breakdown_path.exists():
            print(f"Warning: no breakdown at {breakdown_path}", file=sys.stderr)
        else:
            try:
                data = json.loads(breakdown_path.read_text(encoding="utf-8"))
                for n in data.get("nuggets", []):
                    if not n.get("cache_key"):
                        continue
                    resolved_nuggets.append(n)
            except (json.JSONDecodeError, OSError) as e:
                print(f"Warning: skipping {breakdown_path}: {e}", file=sys.stderr)
    else:
        print("Warning: write_eval_dataset requires nuggets or source_hash_val", file=sys.stderr)

    assets_base = project_root() / "eval-ui" / "public" / "eval-assets"
    out_dir = project_root() / "eval-ui" / "public"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "eval-dataset.json"

    # Load existing traces (additive: only overwrite cache overlaps from this run)
    existing_traces: list[dict] = []
    if out_path.exists():
        try:
            existing_traces = json.loads(out_path.read_text(encoding="utf-8"))
            if not isinstance(existing_traces, list):
                existing_traces = []
        except (json.JSONDecodeError, OSError):
            pass

    if not resolved_nuggets:
        out_path.write_text(json.dumps(existing_traces, indent=2), encoding="utf-8")
        return out_path

    for nugget in resolved_nuggets:
        cache_key = nugget.get("cache_key")
        script_map: dict[str, str] = {}
        assets_map: dict[str, str] = {}  # config.name -> config.hash (for asset path)
        latest_mtime = 0.0
        for config in configs:
            script_path = video_cache_path(cache_key, config.hash, "script.md")
            if not script_path.exists():
                continue
            try:
                script_map[config.name] = script_path.read_text(encoding="utf-8")
                latest_mtime = max(latest_mtime, script_path.stat().st_mtime)
            except OSError:
                continue
            if _copy_assets(cache_key, config, assets_base):
                assets_map[config.name] = config.hash

        if not script_map:
            continue

        src = nugget.get("source_ref") or {}
        trace: dict = {
            "id": cache_key,
            "nuggetId": nugget.get("id", ""),
            "title": nugget.get("title", ""),
            "rawContent": nugget.get("original_text", ""),
            "script": script_map,
            "sourceRef": _format_source_ref(src),
            "createdAt": int(latest_mtime * 1000),
        }
        if assets_map:
            trace["assets"] = assets_map
        traces.append(trace)

    # Additive merge: remove existing traces that overlap with this run's cache_keys
    this_run_ids = {t["id"] for t in traces}
    merged = [t for t in existing_traces if t.get("id") not in this_run_ids] + traces
    out_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return out_path
