"""
DB writer for Run-Video flow. Matches Drizzle schema in packages/db/schema.ts.
Uses psycopg2 for direct Postgres access from the Python pipeline Task.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Literal

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

if TYPE_CHECKING:
    from schemas.table_models import Run, Video

RunStatus = Literal["pending", "processing", "completed", "failed"]
VideoStatus = Literal["preparing", "ready", "failed"]


def _conn():
    if psycopg2 is None:
        raise RuntimeError("psycopg2-binary required. pip install psycopg2-binary")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL env required")
    return psycopg2.connect(url)


def create_video(run_id: str, *, status: VideoStatus = "preparing") -> str:
    """Insert a Video record. Returns the new video id."""
    vid = str(uuid.uuid4())
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO videos (id, run_id, status)
                VALUES (%s, %s, %s)
                """,
                (vid, run_id, status),
            )
        conn.commit()
    return vid


def update_video(
    video_id: str,
    *,
    s3_prefix: str | None = None,
    source_text: str | None = None,
    status: VideoStatus | None = None,
    script: str | None = None,
    chunks: str | None = None,
    cache_key: str | None = None,
    config_hash: str | None = None,
) -> None:
    """Update a Video record."""
    updates: list[tuple[str, object]] = []
    if s3_prefix is not None:
        updates.append(("s3_prefix", s3_prefix))
    if source_text is not None:
        updates.append(("source_text", source_text))
    if status is not None:
        updates.append(("status", status))
    if script is not None:
        updates.append(("script", script))
    if chunks is not None:
        updates.append(("chunks", chunks))
    if cache_key is not None:
        updates.append(("cache_key", cache_key))
    if config_hash is not None:
        updates.append(("config_hash", config_hash))
    if not updates:
        return
    set_clause = ", ".join(f"{k} = %s" for k, _ in updates)
    values = [v for _, v in updates] + [video_id]
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE videos SET {set_clause} WHERE id = %s",
                values,
            )
        conn.commit()


def update_run_status(run_id: str, status: RunStatus) -> None:
    """Update a Run's status."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE runs SET status = %s WHERE id = %s",
                (status, run_id),
            )
        conn.commit()


def _row_to_model(row: dict, model_cls, datetime_fields: tuple[str, ...] = ("created_at",)) -> object:
    """Convert DB row to Pydantic model, serializing datetime fields to ISO strings."""
    d = dict(row)
    for key in datetime_fields:
        if key in d and isinstance(d[key], datetime):
            d[key] = d[key].isoformat()
    return model_cls.model_validate(d)


def get_run(run_id: str) -> Run | None:
    """Get a run by id. Returns Run or None."""
    from schemas.table_models import Run

    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                'SELECT id, "userId", user_input, status, created_at FROM runs WHERE id = %s',
                (run_id,),
            )
            row = cur.fetchone()
            return _row_to_model(dict(row), Run) if row else None


def get_video(video_id: str) -> Video | None:
    """Get a video by id. Returns Video or None."""
    from schemas.table_models import Video

    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, run_id, s3_prefix, source_text, status, script, chunks, cache_key, config_hash, created_at FROM videos WHERE id = %s",
                (video_id,),
            )
            row = cur.fetchone()
            return _row_to_model(dict(row), Video) if row else None
