"""
Emit progress updates to WebSocket via API Gateway Management API.
Used by the pipeline when running as a Task (RUN_ID, CONNECTION_ID provided).
Lambdas use runId to look up connectionId from DynamoDB via emit_by_run_id.
"""

import json
import os
from typing import Any

from logger import warn as log_warn
from schemas.progress_event_type import ProgressEventType  # pyright: ignore[reportMissingImports]

# boto3 for apigatewaymanagementapi and dynamodb
try:
    import boto3
except ImportError:
    boto3 = None


def _get_connection_id(run_id: str, table_name: str) -> str | None:
    """Look up connectionId from DynamoDB by runId (1:1). Returns None if not found."""
    if boto3 is None:
        return None
    dynamo = boto3.client("dynamodb")
    try:
        resp = dynamo.get_item(
            TableName=table_name,
            Key={"runId": {"S": run_id}},
        )
        item = resp.get("Item")
        if item and "connectionId" in item:
            return item["connectionId"].get("S")
    except Exception as e:
        log_warn(f"[websocket_progress] DynamoDB lookup failed: {e}")
    return None


def emit_by_run_id(
    run_id: str,
    message: dict[str, Any],
    *,
    table_name: str | None = None,
) -> None:
    """Look up connectionId by runId, then emit. Used by Lambda handlers."""
    tbl = table_name or os.environ.get("CONNECTIONS_TABLE_NAME")
    if not tbl:
        log_warn("[websocket_progress] CONNECTIONS_TABLE_NAME not set, skipping emit")
        return
    conn_id = _get_connection_id(run_id, tbl)
    if conn_id:
        emit(conn_id, message)
    else:
        log_warn(f"[websocket_progress] no connectionId for runId={run_id}, WebSocket not connected")


def emit_event(
    run_id: str,
    event_type: ProgressEventType | str,
    *,
    video_id: str = "",
    payload: dict[str, Any] | None = None,
    table_name: str | None = None,
) -> None:
    """
    Emit a typed progress event. Higher-level API that understands runId and videoId.
    Use ProgressEventType enum for type safety (shared with React via packages/types).
    """
    type_val = event_type.value if isinstance(event_type, ProgressEventType) else event_type
    message: dict[str, Any] = {
        "runId": run_id,
        "videoId": video_id,
        "type": type_val,
    }
    if payload:
        message["payload"] = payload
    emit_by_run_id(run_id, message, table_name=table_name)


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
        log_warn(f"[websocket_progress] Failed to send: {e}")
