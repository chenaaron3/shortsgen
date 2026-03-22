#!/usr/bin/env python3
"""
Orchestrate source breakdown → pipeline runs.

Break down source material (book, podcast transcript) into atomic idea nuggets,
then run the full pipeline once per nugget. Supports one or more configs;
each config writes to its own cache. With multiple configs, runs breakdown +
pipeline for each, enabling eval comparison.

Usage:
  python generation/scripts/pipeline/run_source_pipeline.py -f book.txt -c configs/default.yaml
  python generation/scripts/pipeline/run_source_pipeline.py -f book.txt -c configs/claude.yaml configs/gpt4o.yaml
  python generation/scripts/pipeline/run_source_pipeline.py -f book.txt -c default --max-nuggets 3
  python generation/scripts/pipeline/run_source_pipeline.py -f book.txt -c default --step breakdown
  python generation/scripts/pipeline/run_source_pipeline.py -f book.txt -c default --step image
  python generation/scripts/pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown  # single content (run_pipeline equivalent)
  python generation/scripts/pipeline/run_source_pipeline.py -f content.txt -c prototype --no-breakdown  # cheap/fast config (flux + readaloud)
"""

import argparse
import hashlib
import sys
from pathlib import Path
from typing import cast

from dotenv import load_dotenv

from config_loader import load_config
from path_utils import breakdown_cache_path, env_path, breakdown_output_dir, video_cache_path
from logger import error, info
from usage_trace import flush_traces_to_disk, print_batch_summary, set_context as usage_set_context
from models import Nugget
from pipeline.breakdown_source import run as run_breakdown, source_hash
from pipeline.run_pipeline import run_batch
from pipeline.write_eval_dataset import write_eval_dataset
from upload.upload_youtube import upload_nuggets_to_youtube


def content_hash(content: str) -> str:
    """Pipeline cache key for raw content (first 16 chars of SHA256)."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]

load_dotenv(env_path())


def write_videos_markdown(
    source_key: str,
    config_hash: str,
    nuggets: list,
    source_name: str = "",
) -> Path:
    """Write videos.md in per-config breakdown output dir with links to generated videos."""
    breakdown_dir = breakdown_output_dir(source_key, config_hash)
    breakdown_dir.mkdir(parents=True, exist_ok=True)
    md_path = breakdown_dir / "videos.md"

    lines = [
        "# Generated Videos",
        "",
        f"*Source: {source_name}*" if source_name else "",
        "",
    ]
    if source_name:
        lines.append("")

    for i, n in enumerate(nuggets, 1):
        ck = getattr(n, "cache_key", None) or (n.get("cache_key") if isinstance(n, dict) else None)
        if not ck:
            continue
        video_path = video_cache_path(ck, config_hash, "short.mp4")
        rel = f"../../videos/{ck}/short.mp4"
        title = getattr(n, "title", None) or (n.get("title") if isinstance(n, dict) else "?")
        link = f"[{title}]({rel})"
        flag = " *(missing)*" if not video_path.exists() else ""
        lines.append(f"{i}. {link}{flag}")

    md_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return md_path


def main():
    parser = argparse.ArgumentParser(
        description="Break down source into nuggets, run pipeline once per nugget."
    )
    parser.add_argument("-f", "--file", help="Path to source file (book or transcript, markdown). Required for --no-breakdown.")
    parser.add_argument(
        "--no-breakdown",
        action="store_true",
        help="Skip breakdown; use entire source as one nugget (run_pipeline equivalent)",
    )
    parser.add_argument(
        "-c",
        "--config",
        nargs="+",
        required=True,
        help="Config YAML path(s) (e.g. configs/default.yaml). Multiple configs run in sequence.",
    )

    parser.add_argument(
        "--max-scenes",
        type=int,
        default=None,
        metavar="N",
        help="Pass through to run_pipeline: only generate first N scenes per nugget",
    )
    parser.add_argument(
        "--max-nuggets",
        type=int,
        default=10,
        metavar="N",
        help="Only process first N nuggets (for testing)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=3,
        metavar="N",
        help="Max nugget pipelines to run in parallel (default: 2)",
    )
    parser.add_argument(
        "--break",
        dest="break_at",
        choices=["breakdown", "script", "chunker", "image", "voice", "prepare"],
        default=None,
        metavar="STEP",
        help="Stop after this step (breakdown=breakdown only, script/chunker/...=per-nugget pipeline steps)",
    )
    parser.add_argument(
        "--step",
        choices=["breakdown", "script", "chunker", "image", "voice", "prepare", "video"],
        default=None,
        metavar="STEP",
        help="Invalidate cache for STEP and all subsequent (breakdown=shared breakdown; script/...=per-nugget)",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="After rendering, upload each video to YouTube (requires credentials.json, token.json)",
    )
    args = parser.parse_args()

    no_breakdown = args.no_breakdown

    if no_breakdown and not args.file:
        error("Error: --no-breakdown requires -f.")
        sys.exit(1)
    if not no_breakdown and not args.file:
        error("Error: -f/--file is required for source breakdown.")
        sys.exit(1)

    source_path = Path(args.file)
    if not source_path.exists():
        error(f"Error: File not found: {source_path}")
        sys.exit(1)

    source_content = source_path.read_text(encoding="utf-8")
    if not source_content.strip():
        error("Error: Source file is empty.")
        sys.exit(1)

    configs = [load_config(c) for c in args.config]
    source_key = source_hash(source_content)
    usage_set_context(source_key, "_breakdown")
    info(f"📚 Source: {source_path.name}")
    info(f"🔑 source_key: {source_key}")
    info(f"📋 Configs: {[c.name for c in configs]}")

    if no_breakdown:
        cache_key = content_hash(source_content)
        lines = source_content.count("\n") + 1
        nuggets = [
            Nugget(
                id=cache_key,
                title=source_path.stem,
                start_line=1,
                end_line=lines,
                source_ref=None,
                original_text=source_content,
                cache_key=cache_key,
                word_count=len(source_content.split()),
            )
        ]
        info("  --no-breakdown: using entire source as one nugget")
    else:
        # Run breakdown once (shared across configs for fair comparison)
        skip_breakdown_cache = args.step == "breakdown"
        if skip_breakdown_cache:
            info("  Invalidating breakdown cache")
        info("")
        info("── Breakdown (shared) ──")
        nuggets = run_breakdown(
            source_content,
            source_key,
            config=configs[0],
            skip_cache=skip_breakdown_cache,
            max_nuggets=args.max_nuggets,
        )
        if args.max_nuggets:
            nuggets = nuggets[: args.max_nuggets]
            info(f"  Limiting to first {args.max_nuggets} nuggets")

    if args.break_at == "breakdown":
        nugget_dicts = [n.model_dump() if hasattr(n, "model_dump") else n for n in nuggets]
        flush_traces_to_disk()
        print_batch_summary(nugget_dicts, configs)
        info("")
        info("✅ Done")
        sys.exit(0)

    def on_config_enter(config, items):
        md_path = write_videos_markdown(source_key, config.hash, items, source_path.name if source_path else "")
        info(f"  📄 {md_path}")

    def on_item_done(config, items):
        write_videos_markdown(source_key, config.hash, items, source_path.name if source_path else "")

    # Pass step to run_batch only for per-nugget steps (run_pipeline doesn't know breakdown)
    per_nugget_step = None if args.step == "breakdown" else args.step
    run_batch(
        nuggets,
        configs,
        concurrency=args.concurrency,
        on_config_enter=on_config_enter,
        on_item_done=on_item_done,
        max_scenes=args.max_scenes,
        step=per_nugget_step,
        break_at=args.break_at,
    )

    flush_traces_to_disk()
    nugget_dicts = [n.model_dump() if hasattr(n, "model_dump") else n for n in nuggets]
    print_batch_summary(nugget_dicts, configs)
    info("")

    # Write eval dataset from cached scripts
    eval_path = write_eval_dataset(
        configs=configs,
        source_hash_val=source_key if not no_breakdown else None,
        nuggets=cast(list[dict], nugget_dicts) if no_breakdown else None,
    )
    info(f"   📋 Eval dataset: {eval_path}")

    # Optional: upload to YouTube after rendering
    if args.upload:
        if len(configs) > 1:
            info("")
            info("── Upload to YouTube (using first config only) ──")
        else:
            info("")
            info("── Upload to YouTube ──")
        config = configs[0]
        try:
            info(f"  Config: {config.name}")
            upload_nuggets_to_youtube(
                nuggets,
                config.hash,
                source_key,
                no_breakdown=no_breakdown,
            )
        except (RuntimeError, FileNotFoundError) as e:
            error(f"Upload failed: {e}")
            sys.exit(1)

    info("")
    info("── Breakdown artifacts (index) ──")
    if not no_breakdown:
        bd_path = breakdown_cache_path(source_key)
        if bd_path.exists():
            info(f"   📄 breakdown.json: {bd_path}")
            info("")
    for cfg in configs:
        md_path = breakdown_output_dir(source_key, cfg.hash) / "videos.md"
        if md_path.exists():
            info(f"   📄 videos.md ({cfg.name}): {md_path}")
            info("")

    info("")
    info("✅ Done")
    total_nuggets = len(nuggets) if configs else 0
    total_videos = total_nuggets * len(configs)
    info(f"   {total_videos} video(s) across {len(configs)} config(s)")


if __name__ == "__main__":
    main()
