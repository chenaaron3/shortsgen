from __future__ import annotations

from ingest.router import resolve_adapter
from ingest.url_security import assert_url_safe_for_ingest


def resolve_url_to_text(url: str) -> tuple[str, str]:
    """
    Fetch URL content for pipeline ingest.
    Returns (text_markdown, adapter_name).
    """
    normalized = assert_url_safe_for_ingest(url)
    adapter = resolve_adapter(normalized)
    result = adapter.to_markdown(normalized)
    return result.markdown, result.adapter_name
