#!/usr/bin/env python3
"""
Build pairwise preference dataset from viewer behavior (view counts).

Uses 90-day sliding windows to bound age bias when comparing lifetime views.
Within each window: normalize by median, filter noisy pairs (margin >= 0.25),
output JSONL for training/evaluating a pairwise script judge.

To reduce dataset size and keep the most impactful pairs:
  --min-margin 0.5      # Stronger signal only (e.g. 605 pairs vs 862)
  --max-pairs 200       # Top 200 by margin
  --max-pairs-per-video 10   # Diversity: cap pairs per video

Usage:
  python generation/scripts/run.py judge/build_pairwise_dataset.py
  python generation/scripts/run.py judge/build_pairwise_dataset.py --max-pairs 200 --min-margin 0.5
"""

import argparse
import json
import statistics
from datetime import datetime, timedelta
from pathlib import Path

from path_utils import cache_base, generation_root


def parse_upload_date(s: str) -> datetime | None:
    """Parse YYYYMMDD to datetime (UTC midnight)."""
    if not s or len(s) != 8:
        return None
    try:
        return datetime(int(s[:4]), int(s[4:6]), int(s[6:8]), tzinfo=None)
    except (ValueError, IndexError):
        return None


def build_sliding_windows(
    videos: list[dict],
    window_days: int = 90,
    step_days: int = 30,
) -> list[tuple[datetime, datetime, list[dict]]]:
    """
    Build 90-day sliding windows. Each window is (start, end, videos_in_window).

    Videos are assigned to all windows they fall into.
    """
    dates = []
    for v in videos:
        d = parse_upload_date(v.get("upload_date"))
        if d is not None:
            dates.append(d)
    if not dates:
        return []

    min_date = min(dates)
    max_date = max(dates)
    windows: list[tuple[datetime, datetime, list[dict]]] = []
    start = min_date

    while start <= max_date:
        end = start + timedelta(days=window_days)
        in_window = [
            v
            for v in videos
            if parse_upload_date(v.get("upload_date")) is not None
            and start <= parse_upload_date(v.get("upload_date")) < end
        ]
        if in_window:
            windows.append((start, end, in_window))
        start += timedelta(days=step_days)

    return windows


def normalize_scores(videos_in_window: list[dict]) -> dict[str, float]:
    """Compute normalized_score = view_count / median for each video in window."""
    view_counts = [v.get("view_count") or 0 for v in videos_in_window]
    median_views = statistics.median(view_counts)
    if median_views <= 0:
        return {v["id"]: 0.0 for v in videos_in_window}
    return {v["id"]: (v.get("view_count") or 0) / median_views for v in videos_in_window}


def generate_pairs(
    videos_in_window: list[dict],
    scores: dict[str, float],
    min_margin: float = 0.25,
) -> list[dict]:
    """
    Enumerate all pairs (i, j) where i < j and abs(score_i - score_j) >= min_margin.
    Returns list of pairwise records. Winner always in script_a / video_id_a.
    """
    pairs: list[dict] = []

    for i, va in enumerate(videos_in_window):
        for vb in videos_in_window[i + 1 :]:
            id_a, id_b = va["id"], vb["id"]
            score_a = scores.get(id_a, 0.0)
            score_b = scores.get(id_b, 0.0)
            margin = abs(score_a - score_b)
            if margin < min_margin:
                continue

            # Always put winner in script_a so winner="A" is ground truth
            if score_a > score_b:
                script_a, script_b = va.get("transcript", ""), vb.get("transcript", "")
                video_id_a, video_id_b = id_a, id_b
                upload_a, upload_b = va.get("upload_date", ""), vb.get("upload_date", "")
                sc_a, sc_b = score_a, score_b
            else:
                script_a, script_b = vb.get("transcript", ""), va.get("transcript", "")
                video_id_a, video_id_b = id_b, id_a
                upload_a, upload_b = vb.get("upload_date", ""), va.get("upload_date", "")
                sc_a, sc_b = score_b, score_a

            pairs.append({
                "script_a": script_a,
                "script_b": script_b,
                "winner": "A",
                "score_a": round(sc_a, 4),
                "score_b": round(sc_b, 4),
                "margin": round(margin, 4),
                "video_id_a": video_id_a,
                "video_id_b": video_id_b,
                "upload_date_a": upload_a,
                "upload_date_b": upload_b,
                "window_start": "",
                "window_end": "",
            })
    return pairs


def _format_window_date(dt: datetime) -> str:
    return dt.strftime("%Y%m%d")


def _reduce_to_impactful(
    pairs: list[dict],
    max_pairs: int | None = None,
    max_pairs_per_video: int | None = None,
    ensure_coverage: bool = True,
) -> list[dict]:
    """
    Reduce to the most impactful pairs by:
    1. Ensuring every video appears at least once (if ensure_coverage)
    2. Minimizing duplicate appearances (spread pairs across videos)
    3. Prioritizing higher margin within those constraints
    """
    if not pairs:
        return pairs

    all_videos = set()
    for p in pairs:
        all_videos.add(p["video_id_a"])
        all_videos.add(p["video_id_b"])

    effective_max = max_pairs if max_pairs and max_pairs > 0 else None
    if effective_max is None and max_pairs_per_video is None and not ensure_coverage:
        return sorted(pairs, key=lambda p: p["margin"], reverse=True)

    # Sort by margin descending (strongest first)
    pairs_by_margin = sorted(pairs, key=lambda p: p["margin"], reverse=True)
    selected: list[dict] = []
    covered: set[str] = set()
    appearance_count: dict[str, int] = {v: 0 for v in all_videos}
    used_pair_ids: set[int] = set()

    def _add_pair(p: dict) -> None:
        selected.append(p)
        used_pair_ids.add(id(p))
        covered.add(p["video_id_a"])
        covered.add(p["video_id_b"])
        appearance_count[p["video_id_a"]] += 1
        appearance_count[p["video_id_b"]] += 1

    # Phase 1: Ensure every video appears at least once
    if ensure_coverage:
        while covered != all_videos:
            best: dict | None = None
            best_new = 0
            best_margin = 0.0
            for p in pairs_by_margin:
                if id(p) in used_pair_ids:
                    continue
                new = (1 if p["video_id_a"] not in covered else 0) + (
                    1 if p["video_id_b"] not in covered else 0
                )
                if new > 0 and (
                    new > best_new or (new == best_new and p["margin"] > best_margin)
                ):
                    best = p
                    best_new = new
                    best_margin = p["margin"]
            if best is None:
                break
            _add_pair(best)

    # Phase 2: Fill remaining slots, preferring pairs that minimize duplicate appearances
    remaining = (effective_max - len(selected)) if effective_max else len(pairs_by_margin)
    if max_pairs_per_video is not None:
        cap = max_pairs_per_video
    else:
        cap = float("inf")

    while remaining > 0:
        candidates = [
            p
            for p in pairs_by_margin
            if id(p) not in used_pair_ids
            and appearance_count.get(p["video_id_a"], 0) < cap
            and appearance_count.get(p["video_id_b"], 0) < cap
        ]
        if not candidates:
            break
        # Prefer pairs with lowest combined appearance count; tie-break by margin
        best = min(
            candidates,
            key=lambda p: (
                appearance_count[p["video_id_a"]] + appearance_count[p["video_id_b"]],
                -p["margin"],
            ),
        )
        _add_pair(best)
        remaining -= 1

    return selected


def _shuffle_ab_by_hash(pairs: list[dict]) -> None:
    """
    Deterministically swap A and B for ~50% of pairs using hash of video IDs.
    Ensures winner is not always A; independent of pair order in list.
    Modifies pairs in place.
    """
    for p in pairs:
        vid_a, vid_b = p.get("video_id_a") or "", p.get("video_id_b") or ""
        if hash((vid_a, vid_b)) % 2 == 0:
            p["script_a"], p["script_b"] = p["script_b"], p["script_a"]
            p["video_id_a"], p["video_id_b"] = p["video_id_b"], p["video_id_a"]
            p["upload_date_a"], p["upload_date_b"] = p["upload_date_b"], p["upload_date_a"]
            p["score_a"], p["score_b"] = p["score_b"], p["score_a"]
            p["winner"] = "B" if p["winner"] == "A" else "A"


def run(
    index_path: Path,
    output_path: Path,
    window_days: int = 90,
    step_days: int = 30,
    min_margin: float = 0.25,
    max_pairs: int | None = 100,
    max_pairs_per_video: int | None = None,
) -> int:
    """
    Load index, build windows, generate pairs, write JSONL.
    Returns count of pairs written.
    """
    data = json.loads(index_path.read_text(encoding="utf-8"))
    videos = data.get("videos", [])
    if not videos:
        print("No videos in index.")
        return 0

    windows = build_sliding_windows(videos, window_days=window_days, step_days=step_days)
    best_by_pair: dict[tuple[str, str], dict] = {}

    for start, end, videos_in_window in windows:
        scores = normalize_scores(videos_in_window)
        pairs = generate_pairs(videos_in_window, scores, min_margin=min_margin)
        for p in pairs:
            p["window_start"] = _format_window_date(start)
            p["window_end"] = _format_window_date(end)
            id1, id2 = p["video_id_a"], p["video_id_b"]
            key = (min(id1, id2), max(id1, id2))
            if key not in best_by_pair or p["margin"] > best_by_pair[key]["margin"]:
                best_by_pair[key] = p

    all_pairs = _reduce_to_impactful(list(best_by_pair.values()), max_pairs, max_pairs_per_video)
    _shuffle_ab_by_hash(all_pairs)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for p in all_pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    return len(all_pairs)


def main() -> None:
    default_index = generation_root() / "scripts" / "scraper" / "transcripts" / "index.json"
    default_output = cache_base() / "judge" / "pairwise.jsonl"

    parser = argparse.ArgumentParser(
        description="Build pairwise preference dataset from viewer behavior"
    )
    parser.add_argument(
        "--index",
        type=Path,
        default=default_index,
        help=f"Path to index.json (default: {default_index})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=default_output,
        help=f"Output JSONL path (default: {default_output})",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=90,
        help="Sliding window size in days (default: 90)",
    )
    parser.add_argument(
        "--window-step",
        type=int,
        default=30,
        help="Step between windows in days (default: 30)",
    )
    parser.add_argument(
        "--min-margin",
        type=float,
        default=0.25,
        help="Minimum normalized score difference to create a pair (default: 0.25)",
    )
    parser.add_argument(
        "--max-pairs",
        type=int,
        default=100,
        metavar="N",
        help="Keep only top N pairs by margin (strongest first). Default: 100. Use 0 for no limit.",
    )
    parser.add_argument(
        "--max-pairs-per-video",
        type=int,
        default=None,
        help="Cap each video to at most N pairs (improves diversity). Default: no limit.",
    )
    args = parser.parse_args()

    if not args.index.exists():
        print(f"Error: Index not found at {args.index}")
        exit(1)

    count = run(
        index_path=args.index,
        output_path=args.output,
        window_days=args.window_days,
        step_days=args.window_step,
        min_margin=args.min_margin,
        max_pairs=args.max_pairs if args.max_pairs else None,
        max_pairs_per_video=args.max_pairs_per_video,
    )
    print(f"Wrote {count} pairwise examples to {args.output}")


if __name__ == "__main__":
    main()
