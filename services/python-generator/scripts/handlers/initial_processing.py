"""
Lambda handler: Initial Processing. Source -> breakdown -> parallel clip processing (script -> scenes per clip).
Emits progress via WebSocket (runId -> connectionId lookup).
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Ensure scripts dir is on path
_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from config_loader import load_config
from models import Nugget, ProcessedClip
from pipeline.breakdown_source import run as run_breakdown, source_hash
from pipeline.generate_script import run as run_script
from pipeline.run_chunker import run as run_chunker
from run_video.persistence.run_video_writer import create_video, update_run_status, update_video
from run_video.websocket_progress import emit_event
from schemas.progress_event_type import ProgressEventType


def _content_cache_key(text: str) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _process_one_clip(nugget: Nugget, config, config_hash: str, run_id: str, video_id: str) -> ProcessedClip:
    """Run script + chunker for one nugget. Returns { videoId, script, chunks }."""
    raw = nugget.original_text or ""
    cache_key = nugget.cache_key or _content_cache_key(raw)
    script = run_script(raw, cache_key, config, config_hash, skip_cache=True)
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
        return {"statusCode": 400, "body": json.dumps({"error": "runId and sourceContent required"})}

    config = load_config(config_name)
    config_hash = config.hash

    emit_event(run_id, ProgressEventType.breakdown_started)

    # 1. Breakdown
    source_key = source_hash(source_content)
    nuggets = run_breakdown(source_content, source_key, config=config, skip_cache=True)
    breakdown_json = json.dumps([n.model_dump() for n in nuggets])
    emit_event(
        run_id,
        ProgressEventType.breakdown_complete,
        payload={"nuggets": breakdown_json},
    )

    # 2. Create video per nugget, process in parallel (script -> scenes)
    results = []
    with ThreadPoolExecutor(max_workers=min(5, len(nuggets))) as executor:
        futures = {}
        for nugget in nuggets:
            video_id = create_video(run_id, status="preparing")
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
                    status="preparing",
                )
                emit_event(
                    run_id,
                    ProgressEventType.clip_complete,
                    video_id=video_id,
                    payload=result.model_dump(),
                )
                results.append(result.model_dump())
            except Exception as e:
                emit_event(
                    run_id,
                    ProgressEventType.error,
                    video_id=video_id,
                    payload={"error": str(e)},
                )
                raise

    update_run_status(run_id, "completed")
    emit_event(
        run_id,
        ProgressEventType.initial_processing_complete,
        payload={"clips": results},
    )
    return {"statusCode": 200, "body": json.dumps({"runId": run_id, "status": "completed"})}
