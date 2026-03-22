#!/usr/bin/env python3
"""
Break down source material (book, podcast transcript) into atomic idea nuggets.
Called by run_source_pipeline. Outputs to cache/_breakdown/{source_hash}/breakdown.json (shared across configs).
"""

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, cast

from dotenv import load_dotenv
from litellm import completion

from models import BreakdownOutput, Nugget
from schema_utils import schema_for_openai

from path_utils import env_path, prompts_dir, breakdown_cache_path, breakdown_dir, breakdown_raw_path
from logger import cache_hit, cache_miss, error, info, step_end, step_start, warn
from usage_trace import record_llm

load_dotenv(env_path())


def source_hash(source_content: str) -> str:
    """Compute cache key for source: hash(content)."""
    return hashlib.sha256(source_content.encode("utf-8")).hexdigest()[:16]


def _content_cache_key(text: str) -> str:
    """Pipeline cache key for a nugget (same as run_pipeline.content_hash)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _split_into_sentences(content: str) -> str:
    """Split content so each line is at most one sentence (normalized line length)."""
    # Split on sentence boundaries: . ! ? followed by whitespace (avoid "1. " in numbered lists)
    parts = re.split(r"(?<=[.!?])(?<!\d\.)\s+", content)
    sentences = [p.strip() for p in parts if p.strip()]
    return "\n".join(sentences)


def _add_line_numbers_and_word_counts(content: str) -> str:
    """Prefix each line with line number and word count: line_num|word_count|sentence."""
    lines = content.splitlines()
    return "\n".join(
        f"{i + 1}|{_word_count(line)}|{line}" for i, line in enumerate(lines)
    )


def _extract_lines(content: str, start_line: int, end_line: int) -> str:
    """Extract lines from content (1-indexed, inclusive)."""
    lines = content.splitlines()
    selected = lines[start_line - 1 : end_line]
    return "\n".join(selected)


def _load_system_prompt(prompt_filename: str) -> str:
    """Load the source breakdown system prompt."""
    prompt_path = prompts_dir() / prompt_filename
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
    return prompt_path.read_text(encoding="utf-8")


def _extract_json(content: str) -> str:
    """Extract JSON from response (handle markdown code blocks)."""
    content = content.strip()
    if content.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            return match.group(1).strip()
    return content


MIN_WORDS_PER_NUGGET = 250


def _word_count(text: str) -> int:
    """Count words in text (split on whitespace)."""
    return len((text or "").split())


def _ensure_min_words(
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
        words_needed = MIN_WORDS_PER_NUGGET - _word_count(n.original_text or "")
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
            words_needed -= _word_count(lines[line_num - 1])

        if new_end != n.end_line:
            n.end_line = new_end
            n.original_text = _extract_lines(source_content, n.start_line, n.end_line)
            n.cache_key = _content_cache_key(n.original_text)
            n.word_count = _word_count(n.original_text or "")
            extended += 1

    if extended:
        info(f"  post_process: _ensure_min_words extended {extended} nugget(s)")
    return work


def _merge_overlaps(
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
                    word_count=_word_count(n.original_text or ""),
                )
            )
        else:
            last = result[-1]
            merged_end = max(last.end_line, n.end_line)
            merged_text = _extract_lines(source_content, last.start_line, merged_end)
            result[-1] = Nugget(
                id=last.id,
                title=last.title,
                start_line=last.start_line,
                end_line=merged_end,
                source_ref=last.source_ref,
                original_text=merged_text,
                cache_key=_content_cache_key(merged_text),
                word_count=_word_count(merged_text),
            )

    if len(result) < len(work):
        info(f"  post_process: _merge_overlaps merged {len(work)} -> {len(result)} nuggets")
    return result


def _reassign_ids(nuggets: list[Nugget]) -> list[Nugget]:
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
                word_count=getattr(n, "word_count", None) or _word_count(n.original_text or ""),
            )
        )
    new_ids = [n.id for n in result]
    if old_ids != new_ids:
        info("  post_process: _reassign_ids modified nugget ids")
    return result


def _post_process(
    nuggets: list[Nugget],
    source_content: str,
) -> list[Nugget]:
    """Post-process LLM nuggets: ensure min words (extend, may create overlaps), merge overlaps, reassign ids."""
    nuggets = _ensure_min_words(nuggets, source_content)
    nuggets = _merge_overlaps(nuggets, source_content)
    nuggets = _reassign_ids(nuggets)
    return nuggets


def _break_down_source(
    source_content: str,
    model: str,
    system_prompt: str,
    max_nuggets: int | None = None,
) -> tuple[BreakdownOutput, str]:
    """Call the LLM to break down source into atomic nuggets (line ranges)."""
    numbered_source = _add_line_numbers_and_word_counts(source_content)
    user_content = "Break down this source. Format: each line is line_num|word_count|sentence.\n\n"
    if max_nuggets is not None:
        user_content += f"\n\nOutput at most {max_nuggets} nugget(s). Prioritize the most important or representative ideas."
    user_content += f"\n\n{numbered_source}"

    schema = BreakdownOutput.model_json_schema()
    if max_nuggets is not None:
        if "properties" in schema and "nuggets" in schema["properties"]:
            schema["properties"]["nuggets"]["maxItems"] = max_nuggets
    schema = schema_for_openai(schema)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": schema.get("title", "BreakdownOutput"),
            "strict": True,
            "schema": schema,
        },
    }

    try:
        user_message = f"{user_content}\n\nRespond with valid JSON only."
        response = cast(
            Any,
            completion(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_format=response_format,
                temperature=0.5,
            ),
        )
        content = (response.choices[0].message.content or "").strip()
        content = _extract_json(content)
        parsed = BreakdownOutput.model_validate_json(content)
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Breakdown", model, u.prompt_tokens, u.completion_tokens)
        return parsed, user_content
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)


def run(
    source_content: str,
    source_key: str,
    config,
    skip_cache: bool = False,
    max_nuggets: int | None = None,
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
    system_prompt = _load_system_prompt(config.breakdown.system_prompt)
    result, user_content = _break_down_source(
        sentence_content, config.breakdown.model, system_prompt, max_nuggets
    )
    breakdown_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path = breakdown_dir(source_key) / "breakdown_llm_prompt.md"
    prompt_path.write_text(
        f"# System\n\n{system_prompt}\n\n# User\n\n{user_content}",
        encoding="utf-8",
    )
    for n in result.nuggets:
        n.original_text = _extract_lines(sentence_content, n.start_line, n.end_line)
        n.cache_key = _content_cache_key(n.original_text)
        n.word_count = _word_count(n.original_text or "")

    pre_post_process_path = breakdown_raw_path(source_key)
    pre_post_process_path.write_text(
        BreakdownOutput(nuggets=result.nuggets).model_dump_json(indent=2),
        encoding="utf-8",
    )

    result.nuggets = _post_process(result.nuggets, sentence_content)

    # Filter out nuggets with no source text (LLM can return invalid line ranges)
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
        warn(f"Filtered {len(result.nuggets) - len(valid_nuggets)} invalid nuggets (empty source text), {len(valid_nuggets)} valid")
    if not valid_nuggets:
        error("No valid nuggets (all had empty source text). Aborting.")
        sys.exit(1)
    result.nuggets = valid_nuggets

    breakdown_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    step_end("Breakdown", outputs=[breakdown_path], cache_hits=0, cache_misses=1)
    return valid_nuggets
