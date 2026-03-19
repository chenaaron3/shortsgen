"""Upload prepared Remotion assets to S3 for Run-Video flow."""

import os
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None


def _s3_prefix(run_id: str, video_id: str | None) -> str:
    """Form S3 prefix: runs/{run_id}/ or runs/{run_id}/{video_id}/."""
    prefix = f"runs/{run_id}/"
    if video_id:
        prefix = f"runs/{run_id}/{video_id}/"
    return prefix


def upload_to_run(
    run_id: str,
    local_path: Path | str,
    *,
    video_id: str | None = None,
    path: str | None = None,
    extra_args: dict | None = None,
) -> str:
    """Upload a file or directory to S3 under runs/{run_id}/ or runs/{run_id}/{video_id}/.

    Bucket name is resolved from BUCKET_NAME env. Key is formed within this helper.
    Returns the S3 prefix for storing in DB. No-op when BUCKET_NAME is unset (e.g. local dev).

    Args:
        run_id: Run ID (required).
        local_path: Local file or directory to upload.
        video_id: Video ID (optional). When provided, objects go under runs/{run_id}/{video_id}/.
        path: Optional relative key for single-file uploads. Defaults to filename.
        extra_args: Extra S3 kwargs (e.g. ContentType override).

    Returns:
        S3 prefix (e.g. runs/{run_id}/{video_id}/).
    """
    bucket_name = os.environ.get("BUCKET_NAME")
    prefix = _s3_prefix(run_id, video_id)
    if not bucket_name:
        return prefix

    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")
    local_path = Path(local_path)
    if not local_path.exists():
        return prefix

    if local_path.is_file():
        key = prefix + (path if path is not None else local_path.name)
        _upload_file(local_path, bucket_name, key, extra_args=extra_args)
    else:
        _upload_dir(local_path, bucket_name, prefix, extra_args=extra_args)

    return prefix


def _upload_dir(
    local_dir: Path,
    bucket_name: str,
    s3_prefix: str,
    *,
    extra_args: dict | None = None,
) -> None:
    """Upload a directory tree to S3. Preserves relative paths under s3_prefix."""
    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")
    prefix = s3_prefix.rstrip("/") + "/"
    client = boto3.client("s3")
    for root, _, files in os.walk(local_dir):
        root_path = Path(root)
        for name in files:
            fp = root_path / name
            rel = fp.relative_to(local_dir)
            key = prefix + str(rel).replace("\\", "/")
            kwargs = {"ContentType": _content_type(rel.suffix)}
            if extra_args:
                kwargs.update(extra_args)
            client.upload_file(str(fp), bucket_name, key, ExtraArgs=kwargs)


def _upload_file(
    local_path: Path,
    bucket_name: str,
    s3_key: str,
    *,
    extra_args: dict | None = None,
) -> None:
    """Upload a single file to S3."""
    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")
    client = boto3.client("s3")
    kwargs = {"ContentType": _content_type(local_path.suffix)}
    if extra_args:
        kwargs.update(extra_args)
    client.upload_file(str(local_path), bucket_name, s3_key, ExtraArgs=kwargs)

def _content_type(suffix: str) -> str:
    m = {
        ".json": "application/json",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
    }
    return m.get(suffix.lower(), "application/octet-stream")
