"""Source chunker protocol."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from models import BreakdownOutput

if TYPE_CHECKING:
    from config_loader import Config


class SourceChunker(Protocol):
    def chunk(
        self,
        sentence_content: str,
        config: "Config",
        max_nuggets: int = 10,
        *,
        source_key: str,
    ) -> BreakdownOutput:
        """Produce final BreakdownOutput; may write under cache/_breakdown/{source_key}/."""
        ...
