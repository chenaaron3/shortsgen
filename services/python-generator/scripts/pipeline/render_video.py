#!/usr/bin/env python3
"""
Render the ShortVideo composition. Called by run_pipeline after prepare.
Outputs to cache/{cache_key}/short.mp4 (copied from Remotion default out/ if needed).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from path_utils import remotion_app_root, remotion_composite_key, video_cache_path, video_public
from logger import cache_hit, info, step_end, step_start


def run(
    cache_key: str,
    config_hash: str,
    *,
    skip_cache: bool = False,
) -> Path:
    """Render the ShortVideo composition. Returns output path."""
    root = remotion_app_root()
    composite_key = remotion_composite_key(config_hash, cache_key)
    output_path = video_cache_path(cache_key, config_hash, "short.mp4")
    step_start("Render video")
    if not skip_cache and output_path.exists():
        cache_hit(output_path)
        step_end("Render video", outputs=[output_path], cache_hits=1, cache_misses=0)
        return output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)
    info(f"  Rendering to {output_path}...")
    props = json.dumps({"cacheKey": composite_key})
    cmd = [
        "npx",
        "remotion",
        "render",
        "ShortVideo",
        "--props",
        props,
        "--public-dir",
        str(video_public()),
        "--codec",
        "h264",
        "--output",
        str(output_path),
    ]
    result = subprocess.run(cmd, cwd=root)
    if result.returncode != 0:
        sys.exit(result.returncode)

    step_end("Render video", outputs=[output_path], cache_hits=0, cache_misses=1)
    return output_path
