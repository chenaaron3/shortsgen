"""
Lambda handler: Update Clip With Feedback. Applies script + per-scene feedback, regenerates chunks.
"""

import json
import sys
import traceback
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from logger import error as log_error, info as log_info, run_video_context, warn as log_warn
from models import Chunks
from pipeline.apply_feedback import apply_feedback
from run_video.persistence.run_video_writer import get_video
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, videoId, scriptFeedback?, sceneFeedback? }."""
    run_id = event.get("runId")
    video_id = event.get("videoId")
    script_feedback = event.get("scriptFeedback")
    scene_feedback = event.get("sceneFeedback")
    if not run_id or not video_id:
        log_warn(f"[update-feedback] 400 runId={run_id!r} videoId={video_id!r}")
        return {"statusCode": 400, "body": json.dumps({"error": "runId and videoId required"})}

    with run_video_context(run_id, video_id):
        try:
            return _handler_impl(run_id, video_id, script_feedback, scene_feedback)
        except Exception as e:
            log_error(f"[update-feedback] failed runId={run_id} videoId={video_id}: {e}")
            traceback.print_exc()
            return {
                "statusCode": 500,
                "body": json.dumps({"error": str(e), "runId": run_id, "videoId": video_id}),
            }


def _handler_impl(run_id: str, video_id: str, script_feedback, scene_feedback) -> dict:
    log_info(f"[update-feedback] fetching video videoId={video_id}")
    video = get_video(video_id)
    if not video or str(video.run_id) != str(run_id):
        log_warn(f"[update-feedback] 404 runId={run_id} videoId={video_id} video={video is not None}")
        return {"statusCode": 404, "body": json.dumps({"error": "Video not found"})}

    script = video.script or ""
    chunks_json = video.chunks
    if not chunks_json:
        log_warn(f"[update-feedback] 400 runId={run_id} videoId={video_id} video has no chunks")
        return {"statusCode": 400, "body": json.dumps({"error": "Video has no chunks"})}

    chunks = Chunks.model_validate_json(chunks_json)
    config_hash = video.config_hash or "default"
    config = load_config(config_hash)
    log_info(f"[update-feedback] applying feedback config={config_hash} scriptFeedback={bool(script_feedback)} sceneFeedback={len(scene_feedback or [])} scenes")

    emit_event(
        run_id,
        ProgressEventType.suggestion_started,
        video_id=video_id,
        workflow="update_feedback",
    )

    estimated_output_len = len(chunks.model_dump_json()) * 1.2

    def on_partial(partial: str) -> None:
        progress_val = min(0.95, len(partial) / estimated_output_len) if estimated_output_len > 0 else 0.5
        emit_event(
            run_id,
            ProgressEventType.suggestion_partial,
            video_id=video_id,
            workflow="update_feedback",
            progress=progress_val,
            payload={"partial": partial},
        )

    revised = apply_feedback(
        script,
        chunks,
        config,
        script_feedback=script_feedback,
        scene_feedback=scene_feedback,
        on_partial=on_partial,
    )
    log_info(f"[update-feedback] feedback applied, emitting suggestion_completed (client must accept to persist)")
    emit_event(
        run_id,
        ProgressEventType.suggestion_completed,
        video_id=video_id,
        workflow="update_feedback",
        payload={"chunks": revised.model_dump()},
    )
    log_info(f"[update-feedback] done runId={run_id} videoId={video_id}")
    return {"statusCode": 200, "body": json.dumps({"chunks": revised.model_dump()})}
