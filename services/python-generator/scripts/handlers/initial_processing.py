"""
Lambda handler: Initial Processing. Source -> breakdown -> parallel clip processing (script -> scenes per clip).
Emits progress via WebSocket (runId -> connectionId lookup).
"""

import json
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Ensure scripts dir is on path
_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from logger import error as log_error, info as log_info, run_context, video_context, warn as log_warn
from models import Nugget, ProcessedClip
from path_utils import breakdown_dir, video_cache_path
from pipeline.breakdown_source import run as run_breakdown, source_hash
from pipeline.generate_script import run as run_script
from pipeline.run_chunker import run as run_chunker
from run_video.persistence.run_video_writer import create_video, update_run_status, update_video
from run_video.s3_upload import upload_to_run
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def _content_cache_key(text: str) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _process_one_clip(nugget: Nugget, config, config_hash: str, run_id: str, video_id: str) -> ProcessedClip:
    """Run script + chunker for one nugget. Returns { videoId, script, chunks }."""
    with video_context(video_id):
        return _process_one_clip_impl(nugget, config, config_hash, run_id, video_id)


def _process_one_clip_impl(nugget: Nugget, config, config_hash: str, run_id: str, video_id: str) -> ProcessedClip:
    raw = nugget.original_text or ""
    cache_key = nugget.cache_key or _content_cache_key(raw)
    script = run_script(raw, cache_key, config, config_hash, skip_cache=True)
    update_video(
        video_id,
        script=script,
        cache_key=cache_key,
        config_hash=config_hash,
        source_text=raw,
    )
    emit_event(
        run_id,
        ProgressEventType.script_created,
        video_id=video_id,
        payload={"videoId": video_id, "script": script},
    )
    log_info(f"[initial_processing] script updated videoId={video_id}")
    chunks = run_chunker(script, cache_key, config, config_hash, skip_cache=True)
    return ProcessedClip(
        videoId=video_id,
        script=script,
        chunks=chunks,
        cacheKey=cache_key,
    )


def handler(event: dict, context) -> dict:
    """Lambda entrypoint. Event: { runId, sourceContent, config? }."""
    run_id = event.get("runId")
    source_content = event.get("sourceContent", "")
    config_name = event.get("config", "default")
    if not run_id or not source_content:
        log_warn(f"[initial_processing] 400 runId={run_id!r} sourceContent empty={not source_content}")
        return {"statusCode": 400, "body": json.dumps({"error": "runId and sourceContent required"})}

    with run_context(run_id):
        try:
            return _handler_impl(event, run_id, source_content, config_name)
        except Exception as e:
            log_error(f"[initial_processing] failed runId={run_id}: {e}")
            traceback.print_exc()
            return {
                "statusCode": 500,
                "body": json.dumps({"error": str(e), "runId": run_id}),
            }


def _handler_impl(event: dict, run_id: str, source_content: str, config_name: str) -> dict:
    log_info(f"[initial_processing] starting runId={run_id} config={config_name}")
    config = load_config(config_name)
    config_hash = config.hash
    log_info(f"[initial_processing] config_hash={config_hash}")

    emit_event(run_id, ProgressEventType.breakdown_started)

    # 1. Breakdown
    source_key = source_hash(source_content)
    log_info(f"[initial_processing] running breakdown source_key={source_key}")
    max_nuggets = event.get("maxNuggets", 10)  # 10 for legacy callers that omit the key
    nuggets = run_breakdown(
        source_content, source_key, config=config, skip_cache=True, max_nuggets=max_nuggets
    )
    if not nuggets:
        log_warn("[initial_processing] no meaningful nuggets from breakdown; 0 videos will be created")
    log_info(f"[initial_processing] breakdown complete nuggets={len(nuggets)}")

    bd = breakdown_dir(source_key)
    if bd.exists():
        upload_to_run(run_id, bd)
    breakdown_json = json.dumps([n.model_dump() for n in nuggets])
    emit_event(
        run_id,
        ProgressEventType.breakdown_completed,
        payload={"nuggets": breakdown_json},
    )

    if not nuggets:
        update_run_status(run_id, "failed")
        emit_event(run_id, ProgressEventType.error, payload={"error": "No meaningful nuggets from breakdown"})
        return {"statusCode": 200, "body": json.dumps({"runId": run_id, "status": "failed"})}

    # 2. Create video per nugget, process in parallel (script -> scenes)
    log_info(f"[initial_processing] processing {len(nuggets)} clips in parallel")
    results = []
    with ThreadPoolExecutor(max_workers=min(10, len(nuggets))) as executor:
        futures = {}
        for nugget in nuggets:
            video_id = create_video(run_id, status="created")
            log_info(f"[initial_processing] clip started videoId={video_id}")
            emit_event(
                run_id,
                ProgressEventType.video_started,
                video_id=video_id,
                payload={"videoId": video_id, "sourceText": nugget.original_text or ""},
            )
            future = executor.submit(_process_one_clip, nugget, config, config_hash, run_id, video_id)
            futures[future] = (video_id, nugget)

        for future in as_completed(futures):
            video_id, nugget = futures[future]
            try:
                result = future.result()
                update_video(
                    video_id,
                    script=result.script,
                    chunks=json.dumps(result.chunks.model_dump()),
                    cache_key=result.cacheKey,
                    config_hash=config_hash,
                    source_text=nugget.original_text or "",
                    status="scripts",
                )
                emit_event(
                    run_id,
                    ProgressEventType.video_completed,
                    video_id=video_id,
                    payload=result.model_dump(),
                )
                # Upload per-video artifacts for debugging
                cache_dir = video_cache_path(result.cacheKey, config_hash)
                if cache_dir.exists():
                    upload_to_run(run_id, cache_dir, video_id=video_id)
                results.append(result.model_dump())
                log_info(f"[initial_processing] clip complete videoId={video_id}")
            except Exception as e:
                log_error(f"[initial_processing] clip failed videoId={video_id}: {e}")
                traceback.print_exc()
                emit_event(
                    run_id,
                    ProgressEventType.error,
                    video_id=video_id,
                    payload={"error": str(e)},
                )
                raise

    log_info(f"[initial_processing] all clips done, updating run status")
    update_run_status(run_id, "scripting")
    emit_event(
        run_id,
        ProgressEventType.initial_processing_complete,
        payload={"clips": results},
    )
    log_info(f"[initial_processing] complete runId={run_id} clips={len(results)}")
    return {"statusCode": 200, "body": json.dumps({"runId": run_id, "status": "scripting"})}
