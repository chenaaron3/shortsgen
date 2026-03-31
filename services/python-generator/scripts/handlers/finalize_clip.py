"""
Lambda handler: Finalize Clip. Generate images + voice + prepare, upload to S3.
Calls run_pipeline with in-memory chunks from DB (skips script + chunker).

Config flow (single source of truth):
- createRun passes config ("prototype" | "default") to initial-processing
- initial_processing stores config_hash on each video (from config.hash)
- finalize_clip loads config via load_config(config_hash); image/voice from config.
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
from logger import error as log_error, run_video_context, warn as log_warn
from models import Chunks
from path_utils import remotion_composite_key, video_public
from pipeline.run_pipeline import run as run_pipeline
from run_video.brand_resolve import resolve_brand_for_video_pipeline
from run_video.persistence.run_video_writer import get_video, update_video
from run_video.s3_upload import upload_single_file, upload_to_run
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

    total_scenes = len(chunks.scenes)
    s3_prefix = f"runs/{run_id}/{video_id}/"
    update_video(video_id, s3_prefix=s3_prefix)

    cdn_url = os.environ.get("SHORTGEN_CDN_URL", "")
    asset_base_url = (cdn_url.rstrip("/") + "/" + s3_prefix.rstrip("/")) if cdn_url else ""

    images_done: list[int] = [0]
    voice_done: list[int] = [0]

    def _asset_progress() -> float:
        if total_scenes <= 0:
            return 0.0
        return (images_done[0] + voice_done[0]) / (2 * total_scenes)

    emit_event(
        run_id,
        ProgressEventType.asset_gen_started,
        status_message=f"Images 0/{total_scenes}, Voice 0/{total_scenes}",
        video_id=video_id,
        workflow="finalize_clip",
        progress=0.0,
        payload={
            "step": "images_voice",
            "totalScenes": total_scenes,
            "s3Prefix": s3_prefix,
            "assetBaseUrl": asset_base_url,
        },
    )

    def _emit_asset_progress() -> None:
        emit_event(
            run_id,
            ProgressEventType.asset_gen_progress,
            status_message=f"Images {images_done[0]}/{total_scenes}, Voice {voice_done[0]}/{total_scenes}",
            video_id=video_id,
            workflow="finalize_clip",
            progress=_asset_progress(),
            payload={"imagesDone": images_done[0], "voiceDone": voice_done[0], "totalScenes": total_scenes},
        )

    def on_step_complete(step: str) -> None:
        if step == "image":
            images_done[0] = total_scenes
            _emit_asset_progress()
        elif step == "voice":
            voice_done[0] = total_scenes
            _emit_asset_progress()
        elif step == "prepare":
            # Captions done (covers cache-hit case when on_caption_scene never fired)
            emit_event(
                run_id,
                ProgressEventType.caption_generated,
                status_message="Captions generated",
                video_id=video_id,
                workflow="finalize_clip",
                progress=1.0,
                payload={},
            )

    def on_caption_scene(progress: float) -> None:
        status = (
            "Captions generated"
            if progress >= 1.0
            else f"Transcribing captions... {int(progress * 100)}%"
        )
        emit_event(
            run_id,
            ProgressEventType.caption_generated,
            status_message=status,
            video_id=video_id,
            workflow="finalize_clip",
            progress=progress,
            payload={"captionProgress": progress},
        )

    def _s3_key_from_path(local_path: str) -> str | None:
        """Derive S3 key from local path; expects images/image_N.png or voice/voice_N.mp3."""
        p = Path(local_path)
        if len(p.parts) >= 2:
            return f"{p.parent.name}/{p.name}"
        return None

    def on_image_scene(done_count: int, total: int, path: str | None = None) -> None:
        images_done[0] = done_count
        if path:
            s3_key = _s3_key_from_path(path)
            if s3_key:
                upload_single_file(run_id, video_id, path, s3_key)
                emit_event(
                    run_id,
                    ProgressEventType.image_uploaded,
                    status_message=f"Image {done_count}/{total}",
                    video_id=video_id,
                    workflow="finalize_clip",
                    payload={"sceneIndex": done_count - 1, "path": s3_key},
                )
        _emit_asset_progress()

    def on_voice_scene(done_count: int, total: int, path: str | None = None) -> None:
        voice_done[0] = done_count
        if path:
            s3_key = _s3_key_from_path(path)
            if s3_key:
                upload_single_file(run_id, video_id, path, s3_key)
                emit_event(
                    run_id,
                    ProgressEventType.voice_uploaded,
                    status_message=f"Voice {done_count}/{total}",
                    video_id=video_id,
                    workflow="finalize_clip",
                    payload={"sceneIndex": done_count - 1, "path": s3_key},
                )
        _emit_asset_progress()

    resolved = resolve_brand_for_video_pipeline(run_id, video_id)

    run_pipeline(
        cache_key=cache_key,
        chunks=chunks,
        config=config,
        config_hash=config_hash,
        break_at="prepare",
        on_step_complete=on_step_complete,
        on_image_scene=on_image_scene,
        on_voice_scene=on_voice_scene,
        on_caption_scene=on_caption_scene,
        image_style_prompt=resolved.style_prompt,
        image_mascot_description=resolved.mascot_description,
        image_mascot_path=resolved.mascot_path,
    )

    composite_key = remotion_composite_key(config_hash, cache_key)
    output_dir = video_public() / "shortgen" / composite_key
    # Images and voice were uploaded incrementally; only upload manifest (avoids double-upload)
    manifest_path = output_dir / "manifest.json"
    if manifest_path.exists():
        upload_to_run(run_id, manifest_path, video_id=video_id, path="manifest.json")
    # s3_prefix already set at start of handler

    # don't change to export yet since user can still iterate on assets
    update_video(video_id, s3_prefix=s3_prefix, status="assets")
    emit_event(
        run_id,
        ProgressEventType.asset_gen_completed,
        status_message="",
        video_id=video_id,
        workflow="finalize_clip",
        progress=1.0,
        payload={"videoId": video_id, "s3Prefix": s3_prefix},
    )
    return {"statusCode": 200, "body": json.dumps({"videoId": video_id, "s3Prefix": s3_prefix})}
