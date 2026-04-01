"""Source material chunkers: LLM breakdown vs deterministic line split."""

from typing import Literal

from config_loader import Config

from chunker.base import SourceChunker
from chunker.line_split import LineSplitSourceChunker
from chunker.llm import LlmSourceChunker

__all__ = [
    "SourceChunker",
    "get_source_chunker",
    "LineSplitSourceChunker",
    "LlmSourceChunker",
]


def get_source_chunker(config: Config) -> SourceChunker:
    mode: Literal["llm", "line_split"] = config.breakdown.chunker
    if mode == "line_split":
        return LineSplitSourceChunker()
    return LlmSourceChunker()
