"""Shared text helpers for source chunkers (line extraction, cache keys, word counts)."""

import hashlib


def content_cache_key(text: str) -> str:
    """Pipeline cache key for a nugget (same as run_pipeline.content_hash)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def word_count(text: str) -> int:
    """Count words in text (split on whitespace)."""
    return len((text or "").split())


def extract_lines(content: str, start_line: int, end_line: int) -> str:
    """Extract lines from content (1-indexed, inclusive)."""
    lines = content.splitlines()
    selected = lines[start_line - 1 : end_line]
    return "\n".join(selected)
