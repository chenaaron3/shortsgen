"""
Emit progress updates to WebSocket via API Gateway Management API.
Used by the pipeline when running as a Task (RUN_ID, CONNECTION_ID provided).
"""

import json
import os
from typing import Any

# boto3 for apigatewaymanagementapi
try:
    import boto3
except ImportError:
    boto3 = None


def _get_client():
    """Lazy init of API Gateway Management API client."""
    if boto3 is None:
        raise RuntimeError("boto3 required for WebSocket progress. pip install boto3")
    endpoint = os.environ.get("WEBSOCKET_ENDPOINT")
    if not endpoint:
        raise ValueError("WEBSOCKET_ENDPOINT env required for WebSocket progress")
    # Endpoint should be https (API Gateway uses wss for connect, https for post_to_connection)
    if endpoint.startswith("wss://"):
        endpoint = endpoint.replace("wss://", "https://")
    return boto3.client("apigatewaymanagementapi", endpoint_url=endpoint)


def emit(connection_id: str, message: dict[str, Any]) -> None:
    """Send a JSON message to the WebSocket connection."""
    if not connection_id:
        return
    try:
        client = _get_client()
        client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message).encode("utf-8"),
        )
    except Exception as e:
        # Connection may have closed; log and continue
        print(f"[websocket_progress] Failed to send: {e}", flush=True)


def emit_progress(
    connection_id: str,
    step: str,
    description: str = "",
    progress: float = 0.0,
    **extra: Any,
) -> None:
    """Emit a PROGRESS message. progress is 0.0–1.0."""
    emit(
        connection_id,
        {
            "type": "PROGRESS",
            "step": step,
            "description": description,
            "progress": progress,
            **extra,
        },
    )


def emit_video_created(connection_id: str, video_id: str, run_id: str) -> None:
    """Emit VIDEO_CREATED so frontend can subscribe."""
    emit(connection_id, {"type": "VIDEO_CREATED", "videoId": video_id, "runId": run_id})


def emit_video_ready(
    connection_id: str, video_id: str, s3_prefix: str, run_id: str
) -> None:
    """Emit VIDEO_READY when prepare completes."""
    emit(
        connection_id,
        {
            "type": "VIDEO_READY",
            "videoId": video_id,
            "s3Prefix": s3_prefix,
            "runId": run_id,
        },
    )
