"""Deterministic source chunking: ~100 lines per segment, capped by max_nuggets (default 10)."""

from models import BreakdownOutput, Nugget

from chunker.post_process import reassign_ids
from chunker.text import content_cache_key, extract_lines, word_count
from path_utils import breakdown_raw_path


def _num_chunks(total_lines: int, max_nuggets: int) -> int:
    if total_lines == 0:
        return 0
    return min(max(total_lines // 100, 1), max_nuggets)


def _even_line_ranges(total_lines: int, num_chunks: int) -> list[tuple[int, int]]:
    """1-based inclusive (start, end) ranges covering all lines; distribute remainder across first chunks."""
    if num_chunks <= 0 or total_lines <= 0:
        return []
    base_size = total_lines // num_chunks
    remainder = total_lines % num_chunks
    ranges: list[tuple[int, int]] = []
    start = 1
    for i in range(num_chunks):
        length = base_size + (1 if i < remainder else 0)
        if length <= 0:
            continue
        end = start + length - 1
        ranges.append((start, end))
        start = end + 1
    return ranges


class LineSplitSourceChunker:
    def chunk(
        self,
        sentence_content: str,
        config,
        max_nuggets: int = 10,
        *,
        source_key: str,
    ) -> BreakdownOutput:
        del config  # unused
        lines = sentence_content.splitlines()
        total_lines = len(lines)
        n = _num_chunks(total_lines, max_nuggets)
        ranges = _even_line_ranges(total_lines, n)

        nuggets: list[Nugget] = []
        for i, (start_line, end_line) in enumerate(ranges, start=1):
            nuggets.append(
                Nugget(
                    id=f"segment-{i:03d}",
                    title=f"Lines {start_line}–{end_line}",
                    start_line=start_line,
                    end_line=end_line,
                    source_ref=None,
                )
            )

        for nu in nuggets:
            nu.original_text = extract_lines(sentence_content, nu.start_line, nu.end_line)
            nu.cache_key = content_cache_key(nu.original_text or "")
            nu.word_count = word_count(nu.original_text or "")

        nuggets = reassign_ids(nuggets)
        final = BreakdownOutput(nuggets=nuggets)

        breakdown_raw_path(source_key).write_text(
            final.model_dump_json(indent=2),
            encoding="utf-8",
        )

        return final
