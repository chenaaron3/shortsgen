#!/usr/bin/env python3
"""
Break down source material (book, podcast transcript) into atomic idea nuggets.
Called by run_source_pipeline. Outputs to cache/_breakdown/{source_hash}/breakdown.json (shared across configs).
"""

import hashlib
import json
import re
import sys

from dotenv import load_dotenv

from models import BreakdownOutput, Nugget

from chunker import get_source_chunker
from path_utils import env_path, breakdown_cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start, warn

load_dotenv(env_path())


def source_hash(source_content: str) -> str:
    """Compute cache key for source: hash(content)."""
    return hashlib.sha256(source_content.encode("utf-8")).hexdigest()[:16]


def _content_cache_key(text: str) -> str:
    """Pipeline cache key for a nugget (same as run_pipeline.content_hash)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _split_into_sentences(content: str) -> str:
    """Split content so each line is at most one sentence (normalized line length)."""
    parts = re.split(r"(?<=[.!?])(?<!\d\.)\s+", content)
    sentences = [p.strip() for p in parts if p.strip()]
    return "\n".join(sentences)


def run(
    source_content: str,
    source_key: str,
    config,
    skip_cache: bool = False,
    max_nuggets: int = 10,
) -> list[Nugget]:
    """
    Break down source into nuggets. Uses cache if available.
    Output: cache/_breakdown/{source_hash}/breakdown.json (shared across configs for fair comparison).
    """
    step_start("Breakdown")
    breakdown_path = breakdown_cache_path(source_key)

    if not skip_cache and breakdown_path.exists():
        cache_hit(breakdown_path)
        data = json.loads(breakdown_path.read_text(encoding="utf-8"))
        nuggets = [Nugget.model_validate(n) for n in data["nuggets"]]
        step_end("Breakdown", outputs=[breakdown_path], cache_hits=1, cache_misses=0)
        return nuggets

    cache_miss("breaking down...")
    sentence_content = _split_into_sentences(source_content)
    chunker = get_source_chunker(config)

    breakdown_path.parent.mkdir(parents=True, exist_ok=True)
    result = chunker.chunk(
        sentence_content, config, max_nuggets, source_key=source_key
    )

    valid_nuggets = []
    for n in result.nuggets:
        text = (n.original_text or "").strip()
        if not text:
            warn(
                f"Skipping nugget id={n.id!r} title={n.title!r} "
                f"(no source: original_text empty, start_line={n.start_line} end_line={n.end_line})"
            )
            continue
        valid_nuggets.append(n)
    if len(valid_nuggets) < len(result.nuggets):
        warn(
            f"Filtered {len(result.nuggets) - len(valid_nuggets)} invalid nuggets "
            f"(empty source text), {len(valid_nuggets)} valid"
        )
    if not valid_nuggets:
        error("No valid nuggets (all had empty source text). Aborting.")
        sys.exit(1)
    result = BreakdownOutput(nuggets=valid_nuggets)

    breakdown_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    step_end("Breakdown", outputs=[breakdown_path], cache_hits=0, cache_misses=1)
    return valid_nuggets
