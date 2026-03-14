"""
Lambda handler: Update Clip With Feedback. Applies script + per-scene feedback, regenerates chunks.
"""

import json
import os
import sys
from urllib.parse import quote
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from models import Chunks
from pipeline.apply_feedback import apply_feedback
from run_video.persistence.run_video_writer import get_video, update_video
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def _cloudwatch_url(context) -> str:
    region = os.environ.get("AWS_REGION", "us-east-1")
    lg = (context.log_group_name or "").replace("/", "$252F")
    ls = quote(context.log_stream_name or "", safe="")
    return f"https://{region}.console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{lg}/log-events/{ls}"


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, videoId, scriptFeedback?, sceneFeedback? }."""
    run_id = event.get("runId")
    video_id = event.get("videoId")
    script_feedback = event.get("scriptFeedback")
    scene_feedback = event.get("sceneFeedback")
    if not run_id or not video_id:
        return {"statusCode": 400, "body": json.dumps({"error": "runId and videoId required"})}

    print(f"[update-feedback] runId={run_id} videoId={video_id} | View logs: {_cloudwatch_url(context)}")

    video = get_video(video_id)
    if not video or str(video.run_id) != str(run_id):
        return {"statusCode": 404, "body": json.dumps({"error": "Video not found"})}

    script = video.script or ""
    chunks_json = video.chunks
    if not chunks_json:
        return {"statusCode": 400, "body": json.dumps({"error": "Video has no chunks"})}

    chunks = Chunks.model_validate_json(chunks_json)
    revised = apply_feedback(
        script,
        chunks,
        script_feedback=script_feedback,
        scene_feedback=scene_feedback,
    )
    update_video(video_id, chunks=revised.model_dump_json())
    emit_event(
        run_id,
        ProgressEventType.feedback_applied,
        video_id=video_id,
        payload={"chunks": revised.model_dump()},
    )
    return {"statusCode": 200, "body": json.dumps({"chunks": revised.model_dump()})}
