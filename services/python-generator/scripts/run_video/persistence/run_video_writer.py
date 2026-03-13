"""
DB writer for Run-Video flow. Matches Drizzle schema in packages/db/schema.ts.
Uses psycopg2 for direct Postgres access from the Python pipeline Task.
"""

import os
import uuid
from typing import Literal

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

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
    status: VideoStatus | None = None,
) -> None:
    """Update a Video record."""
    if s3_prefix is None and status is None:
        return
    with _conn() as conn:
        with conn.cursor() as cur:
            if s3_prefix is not None and status is not None:
                cur.execute(
                    "UPDATE videos SET s3_prefix = %s, status = %s WHERE id = %s",
                    (s3_prefix, status, video_id),
                )
            elif s3_prefix is not None:
                cur.execute(
                    "UPDATE videos SET s3_prefix = %s WHERE id = %s",
                    (s3_prefix, video_id),
                )
            else:
                cur.execute(
                    "UPDATE videos SET status = %s WHERE id = %s",
                    (status, video_id),
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
