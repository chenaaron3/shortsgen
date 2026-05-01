"""CloudFront invalidation helper for mutable run assets."""

from __future__ import annotations

import os
import time
import uuid

try:
    import boto3
except ImportError:
    boto3 = None

from logger import info as log_info, warn as log_warn


def invalidate_cdn_paths(paths: list[str]) -> None:
    """Invalidate CDN paths when a mutable S3 object is overwritten.

    No-ops in local/dev environments where the distribution ID is not configured.
    """
    distribution_id = os.environ.get("CLOUDFRONT_DISTRIBUTION_ID")
    if not distribution_id:
        return
    if boto3 is None:
        raise RuntimeError("boto3 required. pip install boto3")

    normalized_paths = sorted(
        {path if path.startswith("/") else f"/{path}" for path in paths}
    )
    if not normalized_paths:
        return

    caller_reference = f"shortgen-{int(time.time() * 1000)}-{uuid.uuid4()}"
    client = boto3.client("cloudfront")
    try:
        resp = client.create_invalidation(
            DistributionId=distribution_id,
            InvalidationBatch={
                "Paths": {
                    "Quantity": len(normalized_paths),
                    "Items": normalized_paths,
                },
                "CallerReference": caller_reference,
            },
        )
    except Exception as e:
        log_warn(f"[cdn] CloudFront invalidation failed: {e}")
        return

    invalidation_id = resp.get("Invalidation", {}).get("Id")
    log_info(
        f"[cdn] invalidation requested id={invalidation_id} paths={normalized_paths}"
    )
