"""Post-process nuggets after LLM or deterministic chunking (min words, merge, ids)."""

import re

from models import Nugget

from chunker.text import content_cache_key, extract_lines, word_count
from logger import info

MIN_WORDS_PER_NUGGET = 250


def ensure_min_words(
    nuggets: list[Nugget],
    source_content: str,
) -> list[Nugget]:
    """Extend short nuggets until each reaches MIN_WORDS. May extend into other nuggets and create overlaps."""
    if not nuggets:
        return nuggets
    num_lines = len(source_content.splitlines())
    if num_lines == 0:
        return nuggets

    work = sorted(nuggets, key=lambda n: n.start_line)
    lines = source_content.splitlines()
    extended = 0

    for n in work:
        words_needed = MIN_WORDS_PER_NUGGET - word_count(n.original_text or "")
        if words_needed <= 0:
            continue

        range_after = (n.end_line + 1, num_lines)
        if range_after[0] > range_after[1]:
            continue

        new_end = n.end_line
        for line_num in range(range_after[0], range_after[1] + 1):
            if words_needed <= 0:
                break
            new_end = line_num
            words_needed -= word_count(lines[line_num - 1])

        if new_end != n.end_line:
            n.end_line = new_end
            n.original_text = extract_lines(source_content, n.start_line, n.end_line)
            n.cache_key = content_cache_key(n.original_text)
            n.word_count = word_count(n.original_text or "")
            extended += 1

    if extended:
        info(f"  post_process: ensure_min_words extended {extended} nugget(s)")
    return work


def merge_overlaps(
    nuggets: list[Nugget],
    source_content: str,
) -> list[Nugget]:
    """Merge overlapping nuggets into single nuggets."""
    if not nuggets:
        return nuggets

    work = sorted(nuggets, key=lambda n: n.start_line)
    result: list[Nugget] = []

    for n in work:
        if not result or result[-1].end_line < n.start_line:
            result.append(
                Nugget(
                    id=n.id,
                    title=n.title,
                    start_line=n.start_line,
                    end_line=n.end_line,
                    source_ref=n.source_ref,
                    original_text=n.original_text,
                    cache_key=n.cache_key,
                    word_count=word_count(n.original_text or ""),
                )
            )
        else:
            last = result[-1]
            merged_end = max(last.end_line, n.end_line)
            merged_text = extract_lines(source_content, last.start_line, merged_end)
            result[-1] = Nugget(
                id=last.id,
                title=last.title,
                start_line=last.start_line,
                end_line=merged_end,
                source_ref=last.source_ref,
                original_text=merged_text,
                cache_key=content_cache_key(merged_text),
                word_count=word_count(merged_text),
            )

    if len(result) < len(work):
        info(f"  post_process: merge_overlaps merged {len(work)} -> {len(result)} nuggets")
    return result


def reassign_ids(nuggets: list[Nugget]) -> list[Nugget]:
    """Reassign consecutive ids (e.g. source-slug-001, source-slug-002)."""
    if not nuggets:
        return nuggets
    old_ids = [n.id for n in nuggets]
    base = re.sub(r"-\d+$", "", nuggets[0].id) if nuggets else "nugget"
    result = []
    for i, n in enumerate(nuggets, 1):
        new_id = f"{base}-{i:03d}"
        result.append(
            Nugget(
                id=new_id,
                title=n.title,
                start_line=n.start_line,
                end_line=n.end_line,
                source_ref=n.source_ref,
                original_text=n.original_text,
                cache_key=n.cache_key,
                word_count=getattr(n, "word_count", None) or word_count(n.original_text or ""),
            )
        )
    new_ids = [n.id for n in result]
    if old_ids != new_ids:
        info("  post_process: reassign_ids modified nugget ids")
    return result


def post_process_llm(nuggets: list[Nugget], source_content: str) -> list[Nugget]:
    """Post-process LLM nuggets: ensure min words, merge overlaps, reassign ids."""
    nuggets = ensure_min_words(nuggets, source_content)
    nuggets = merge_overlaps(nuggets, source_content)
    nuggets = reassign_ids(nuggets)
    return nuggets
