"""
Lambda handler: Update Imagery. Update single-scene imagery (direct or LLM), regenerate image.
Path A: direct imagery text -> use for image generation.
Path B: feedback (like/dislike + reason) -> LLM regenerates imagery.
Either path: regenerate image, run prepare, upload to S3.
"""

import json
import os
import sys
import traceback
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from logger import error as log_error, info as log_info, run_video_context, warn as log_warn
from models import Chunks
from path_utils import remotion_composite_key, video_cache_path, video_public
from pipeline.apply_feedback import apply_feedback
from pipeline.run_pipeline import run as run_pipeline
from run_video.persistence.run_video_writer import get_video, update_video
from run_video.s3_upload import upload_dir_to_s3
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, videoId, sceneIndex, imagery? | feedback? }."""
    run_id = event.get("runId")
    video_id = event.get("videoId")
    scene_index = event.get("sceneIndex")
    imagery = event.get("imagery")
    feedback = event.get("feedback")

    if not run_id or not video_id or scene_index is None:
        log_warn(
            f"[update_imagery] 400 runId={run_id!r} videoId={video_id!r} sceneIndex={scene_index!r}"
        )
        return {"statusCode": 400, "body": json.dumps({"error": "runId, videoId, sceneIndex required"})}

    if not imagery and feedback is None:
        log_warn("[update_imagery] 400 provide imagery or feedback")
        return {"statusCode": 400, "body": json.dumps({"error": "Provide imagery (direct) or feedback (LLM path)"})}

    with run_video_context(run_id, video_id):
        try:
            return _handler_impl(run_id, video_id, scene_index, imagery, feedback)
        except Exception as e:
            log_error(f"[update_imagery] failed runId={run_id} videoId={video_id}: {e}")
            traceback.print_exc()
            return {
                "statusCode": 500,
                "body": json.dumps({"error": str(e), "runId": run_id, "videoId": video_id}),
            }


def _handler_impl(
    run_id: str, video_id: str, scene_index: int, imagery: str | None, feedback: str | None
) -> dict:
    video = get_video(video_id)
    if not video or str(video.run_id) != str(run_id):
        log_warn(f"[update_imagery] 404 runId={run_id} videoId={video_id}")
        return {"statusCode": 404, "body": json.dumps({"error": "Video not found"})}

    chunks_json = video.chunks
    cache_key = video.cache_key
    config_hash = video.config_hash
    script = video.script or ""
    if not chunks_json or not cache_key or not config_hash:
        log_warn(
            f"[update_imagery] 400 runId={run_id} videoId={video_id} "
            f"chunks={bool(chunks_json)} cacheKey={bool(cache_key)} configHash={bool(config_hash)}"
        )
        return {"statusCode": 400, "body": json.dumps({"error": "Video missing chunks, cacheKey, or configHash"})}

    chunks = Chunks.model_validate(json.loads(chunks_json))
    if scene_index < 0 or scene_index >= len(chunks.scenes):
        log_warn(f"[update_imagery] 400 sceneIndex={scene_index} out of range (0..{len(chunks.scenes) - 1})")
        return {"statusCode": 400, "body": json.dumps({"error": "sceneIndex out of range"})}

    config = load_config(config_hash)
    prototype = config_hash == "prototype"

    if imagery is not None and imagery.strip():
        # Path A: direct imagery
        chunks.scenes[scene_index].imagery = imagery.strip()
        log_info(f"[update_imagery] direct imagery for scene {scene_index}")
    else:
        # Path B: LLM from feedback — apply_feedback revises all scenes; we only want imagery for this scene
        scene_feedback = [{"sceneIndex": scene_index, "feedback": feedback or ""}]
        revised = apply_feedback(
            script,
            chunks,
            config,
            script_feedback=None,
            scene_feedback=scene_feedback,
        )
        # Post-process: copy only the imagery for the target scene; preserve text/section/transition and all other scenes
        original_scenes = chunks.scenes
        revised_scenes = revised.scenes
        if scene_index < len(revised_scenes):
            original_scenes[scene_index].imagery = revised_scenes[scene_index].imagery
        chunks = Chunks(
            title=chunks.title,
            description=chunks.description,
            scenes=original_scenes,
        )
        log_info(f"[update_imagery] LLM revised imagery for scene {scene_index}")

    update_video(video_id, chunks=chunks.model_dump_json())

    cache_dir = video_cache_path(cache_key, config_hash)
    cache_dir.mkdir(parents=True, exist_ok=True)
    chunks_path = cache_dir / "chunks.json"
    # Preserve image_path/voice_path for scenes we're NOT regenerating (avoid overwriting)
    if chunks_path.exists():
        existing = json.loads(chunks_path.read_text(encoding="utf-8"))
        for i, scene in enumerate(chunks.scenes):
            if i != scene_index and i < len(existing.get("scenes", [])):
                existing_scene = existing["scenes"][i]
                if existing_scene.get("image_path"):
                    scene.image_path = existing_scene["image_path"]
                if existing_scene.get("voice_path"):
                    scene.voice_path = existing_scene["voice_path"]
    chunks_path.write_text(chunks.model_dump_json(indent=2), encoding="utf-8")

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
        scene_indices=[scene_index],
        break_at="prepare",
        prototype=prototype,
    )

    bucket_name = os.environ.get("BUCKET_NAME")
    composite_key = remotion_composite_key(config_hash, cache_key)
    output_dir = video_public() / "shortgen" / composite_key
    s3_prefix = f"runs/{run_id}/{video_id}/"

    if bucket_name and output_dir.exists():
        upload_dir_to_s3(output_dir, bucket_name, s3_prefix)

    emit_event(
        run_id,
        ProgressEventType.feedback_applied,
        video_id=video_id,
        payload={"chunks": chunks.model_dump()},
    )

    log_info(f"[update_imagery] done runId={run_id} videoId={video_id} sceneIndex={scene_index}")
    return {"statusCode": 200, "body": json.dumps({"chunks": chunks.model_dump()})}
