"""Upload prepared Remotion assets to S3 for Run-Video flow."""

import os
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None


def upload_dir_to_s3(
    local_dir: Path,
    bucket_name: str,
    s3_prefix: str,
    *,
    extra_args: dict | None = None,
) -> None:
    """Upload a directory tree to S3. Preserves relative paths under s3_prefix."""
    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")
    local_dir = Path(local_dir)
    if not local_dir.is_dir():
        raise FileNotFoundError(f"Directory not found: {local_dir}")

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


def upload_file_to_s3(
    local_path: Path,
    bucket_name: str,
    s3_key: str,
    *,
    extra_args: dict | None = None,
) -> None:
    """Upload a single file to S3."""
    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")
    local_path = Path(local_path)
    if not local_path.is_file():
        raise FileNotFoundError(f"File not found: {local_path}")
    client = boto3.client("s3")
    kwargs = {"ContentType": _content_type(local_path.suffix)}
    if extra_args:
        kwargs.update(extra_args)
    client.upload_file(str(local_path), bucket_name, s3_key, ExtraArgs=kwargs)


def _content_type(suffix: str) -> str:
    m = {
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
    }
    return m.get(suffix.lower(), "application/octet-stream")
