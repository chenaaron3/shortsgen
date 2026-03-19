"""
Lambda handler: Finalize Clip. Generate images + voice + prepare, upload to S3.
Calls run_pipeline with in-memory chunks from DB (skips script + chunker).

Config flow (single source of truth):
- createRun passes config ("prototype" | "default") to initial-processing
- initial_processing stores config_hash on each video (from config.hash)
- finalize_clip reads video.config_hash → load_config() for YAML, prototype=(config_hash=="prototype")
"""

import json
import sys
import traceback
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from logger import error as log_error, run_video_context, warn as log_warn
from models import Chunks
from path_utils import remotion_composite_key, video_public
from pipeline.run_pipeline import run as run_pipeline
from run_video.persistence.run_video_writer import get_video, update_video
from run_video.s3_upload import upload_to_run
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, videoId }."""
    run_id = event.get("runId")
    video_id = event.get("videoId")
    if not run_id or not video_id:
        log_warn(f"[finalize_clip] 400 runId={run_id!r} videoId={video_id!r}")
        return {"statusCode": 400, "body": json.dumps({"error": "runId and videoId required"})}

    with run_video_context(run_id, video_id):
        try:
            return _handler_impl(event, run_id, video_id)
        except Exception as e:
            log_error(f"[finalize_clip] failed runId={run_id} videoId={video_id}: {e}")
            traceback.print_exc()
            return {
                "statusCode": 500,
                "body": json.dumps({"error": str(e), "runId": run_id, "videoId": video_id}),
            }


def _handler_impl(event: dict, run_id: str, video_id: str) -> dict:
    video = get_video(video_id)
    if not video or str(video.run_id) != str(run_id):
        log_warn(f"[finalize_clip] 404 runId={run_id} videoId={video_id} video={video is not None}")
        return {"statusCode": 404, "body": json.dumps({"error": "Video not found"})}

    chunks_json = video.chunks
    cache_key = video.cache_key
    config_hash = video.config_hash
    if not chunks_json or not cache_key or not config_hash:
        log_warn(
            f"[finalize_clip] 400 runId={run_id} videoId={video_id} "
            f"chunks={bool(chunks_json)} cacheKey={bool(cache_key)} configHash={bool(config_hash)}"
        )
        return {"statusCode": 400, "body": json.dumps({"error": "Video missing chunks, cacheKey, or configHash"})}

    config = load_config(config_hash)
    chunks = Chunks.model_validate(json.loads(chunks_json))

    # prototype = cheap images/fast whisper; derived from video's config (set at create)
    prototype = config_hash == "prototype"

    update_video(video_id, status="assets")
    emit_event(
        run_id,
        ProgressEventType.asset_gen_started,
        video_id=video_id,
        payload={"step": "images_voice"},
    )

    def on_step_complete(step: str) -> None:
        event = {
            "image": ProgressEventType.image_generated,
            "voice": ProgressEventType.voice_generated,
            "prepare": ProgressEventType.caption_generated,
        }.get(step)
        if event:
            emit_event(run_id, event, video_id=video_id)

    run_pipeline(
        cache_key=cache_key,
        chunks=chunks,
        config=config,
        config_hash=config_hash,
        break_at="prepare",
        prototype=prototype,
        on_step_complete=on_step_complete,
    )

    composite_key = remotion_composite_key(config_hash, cache_key)
    output_dir = video_public() / "shortgen" / composite_key
    s3_prefix = upload_to_run(run_id, output_dir, video_id=video_id)

    # don't change to export yet since user can still iterate on assets
    update_video(video_id, s3_prefix=s3_prefix)
    emit_event(
        run_id,
        ProgressEventType.asset_gen_completed,
        video_id=video_id,
        payload={"videoId": video_id, "s3Prefix": s3_prefix},
    )
    return {"statusCode": 200, "body": json.dumps({"videoId": video_id, "s3Prefix": s3_prefix})}
