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
from logger import error, info, step_end, step_start

def run(cache_key: str) -> Path:
    """Render the ShortVideo composition. Returns output path."""
    root = project_root()
    step_start("Render video")
    output_path = cache_path(cache_key, "short.mp4")
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

    step_end("Render video", outputs=[output_path])
    return output_path
