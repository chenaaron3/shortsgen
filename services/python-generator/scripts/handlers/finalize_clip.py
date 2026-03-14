"""
Lambda handler: Finalize Clip. Generate images + voice + prepare, upload to S3.
Calls run_pipeline with in-memory chunks from DB (skips script + chunker).
"""

import json
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from models import Chunks
from path_utils import remotion_composite_key, video_public
from pipeline.run_pipeline import run as run_pipeline
from run_video.persistence.run_video_writer import get_video, update_video, update_run_status
from run_video.s3_upload import upload_dir_to_s3
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, videoId }."""
    run_id = event.get("runId")
    video_id = event.get("videoId")
    if not run_id or not video_id:
        return {"statusCode": 400, "body": json.dumps({"error": "runId and videoId required"})}

    video = get_video(video_id)
    if not video or str(video.run_id) != str(run_id):
        return {"statusCode": 404, "body": json.dumps({"error": "Video not found"})}

    chunks_json = video.chunks
    cache_key = video.cache_key
    config_hash = video.config_hash
    if not chunks_json or not cache_key or not config_hash:
        return {"statusCode": 400, "body": json.dumps({"error": "Video missing chunks, cacheKey, or configHash"})}

    config = load_config(config_hash)
    chunks = Chunks.model_validate(json.loads(chunks_json))

    emit_event(
        run_id,
        ProgressEventType.finalize_progress,
        video_id=video_id,
        payload={"step": "images_voice"},
    )

    run_pipeline(
        cache_key=cache_key,
        chunks=chunks,
        config=config,
        config_hash=config_hash,
        break_at="prepare",
        prototype=False,
    )

    emit_event(
        run_id,
        ProgressEventType.finalize_progress,
        video_id=video_id,
        payload={"step": "prepare"},
    )

    bucket_name = event.get("bucketName") or __import__("os").environ.get("BUCKET_NAME")
    composite_key = remotion_composite_key(config_hash, cache_key)
    output_dir = video_public() / "shortgen" / composite_key
    s3_prefix = f"runs/{run_id}/{video_id}/"

    if bucket_name and output_dir.exists():
        upload_dir_to_s3(output_dir, bucket_name, s3_prefix)

    update_video(video_id, s3_prefix=s3_prefix, status="ready")
    update_run_status(run_id, "completed")
    emit_event(
        run_id,
        ProgressEventType.finalize_complete,
        video_id=video_id,
        payload={"videoId": video_id, "s3Prefix": s3_prefix},
    )
    return {"statusCode": 200, "body": json.dumps({"videoId": video_id, "s3Prefix": s3_prefix})}
