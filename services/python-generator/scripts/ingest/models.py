from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ScrapeResult:
    source_url: str
    adapter_name: str
    markdown: str
    metadata: dict[str, str] = field(default_factory=dict)
