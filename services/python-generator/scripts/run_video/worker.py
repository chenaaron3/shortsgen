#!/usr/bin/env python3
"""
Task entrypoint for Run-Video flow. Runs when invoked by SST Task.
Expects env: RUN_ID, CONNECTION_ID, USER_INPUT, DATABASE_URL, BUCKET_NAME, WEBSOCKET_ENDPOINT.
"""

import hashlib
import os
import sys
from pathlib import Path

# Ensure scripts dir is on path (parent of run_video)
_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from path_utils import remotion_composite_key, video_public
from pipeline.run_pipeline import run as run_pipeline

from run_video.persistence.run_video_writer import create_video, update_run_status, update_video
from run_video.s3_upload import upload_dir_to_s3
from run_video.websocket_progress import (
    emit_progress,
    emit_video_created,
    emit_video_ready,
)


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def main() -> None:
    run_id = os.environ.get("RUN_ID")
    conn_id = os.environ.get("CONNECTION_ID", "")
    user_input = os.environ.get("USER_INPUT", "")
    bucket_name = os.environ.get("BUCKET_NAME")
    config = os.environ.get("CONFIG", "default")

    if not run_id or not user_input:
        print("RUN_ID and USER_INPUT required", file=sys.stderr)
        sys.exit(1)

    # 1. Create Video at pipeline start (Python creates Video per plan)
    video_id = create_video(run_id, status="preparing")
    emit_video_created(conn_id, video_id, run_id)
    emit_progress(conn_id, "init", "Starting pipeline", 0.0, videoId=video_id)

    # 2. Run pipeline directly: script -> chunker -> images+voice -> prepare (stop before render)
    emit_progress(conn_id, "pipeline", "Running pipeline", 0.1)
    config_obj = load_config(config)
    try:
        run_pipeline(
            raw_content=user_input,
            config=config_obj,
            config_hash=config_obj.hash,
            break_at="prepare",
        )
    except Exception:
        update_run_status(run_id, "failed")
        update_video(video_id, status="failed")
        emit_progress(conn_id, "error", "Pipeline failed", 0.0)
        raise

    # 3. Upload to S3 when bucket is configured
    s3_prefix = f"runs/{run_id}/{video_id}/"
    cache_key = _content_hash(user_input)
    composite_key = remotion_composite_key(config_obj.hash, cache_key)
    output_dir = video_public() / "shortgen" / composite_key
    if bucket_name and output_dir.exists():
        emit_progress(conn_id, "upload", "Uploading to S3", 0.9)
        upload_dir_to_s3(output_dir, bucket_name, s3_prefix)

    update_video(video_id, s3_prefix=s3_prefix, status="ready")
    update_run_status(run_id, "completed")
    emit_video_ready(conn_id, video_id, s3_prefix, run_id)
    emit_progress(conn_id, "done", "Pipeline complete", 1.0)


if __name__ == "__main__":
    main()
