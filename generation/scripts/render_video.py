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

# Add scripts to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
from path_utils import cache_path, project_root
from logger import cache_hit, info, step_end, step_start

def run(cache_key: str, *, skip_cache: bool = False) -> Path:
    """Render the ShortVideo composition. Returns output path."""
    root = project_root()
    output_path = cache_path(cache_key, "short.mp4")
    step_start("Render video")
    if not skip_cache and output_path.exists():
        cache_hit(output_path)
        step_end("Render video", outputs=[output_path], cache_hits=1, cache_misses=0)
        return output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)
    info(f"  Rendering to {output_path}...")
    props = json.dumps({"cacheKey": cache_key})
    cmd = [
        "npx",
        "remotion",
        "render",
        "ShortVideo",
        "--props",
        props,
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
