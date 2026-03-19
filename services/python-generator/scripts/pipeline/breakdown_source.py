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

from dotenv import load_dotenv
from litellm import completion

from models import BreakdownOutput, Nugget
from schema_utils import schema_for_openai

from path_utils import env_path, prompts_dir, breakdown_cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start, warn
from usage_trace import record_llm

load_dotenv(env_path())


def source_hash(source_content: str) -> str:
    """Compute cache key for source: hash(content)."""
    return hashlib.sha256(source_content.encode("utf-8")).hexdigest()[:16]


def _content_cache_key(text: str) -> str:
    """Pipeline cache key for a nugget (same as run_pipeline.content_hash)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _add_line_numbers(content: str) -> str:
    """Prefix each line with its 1-indexed line number."""
    lines = content.splitlines()
    return "\n".join(f"{i + 1}|{line}" for i, line in enumerate(lines))


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


def _break_down_source(
    source_content: str,
    model: str,
    system_prompt: str,
    max_nuggets: int | None = None,
) -> BreakdownOutput:
    """Call the LLM to break down source into atomic nuggets (line ranges)."""
    numbered_source = _add_line_numbers(source_content)
    user_content = "Break down this source into atomic idea nuggets. Output start_line and end_line for each."
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
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{user_content}\n\nRespond with valid JSON only."},
            ],
            response_format=response_format,
            temperature=0.5,
        )
        content = (response.choices[0].message.content or "").strip()
        content = _extract_json(content)
        parsed = BreakdownOutput.model_validate_json(content)
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Breakdown", model, u.prompt_tokens, u.completion_tokens)
        return parsed
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
    system_prompt = _load_system_prompt(config.breakdown.system_prompt)
    result = _break_down_source(source_content, config.breakdown.model, system_prompt, max_nuggets)
    for n in result.nuggets:
        n.original_text = _extract_lines(source_content, n.start_line, n.end_line)
        n.cache_key = _content_cache_key(n.original_text)

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

    breakdown_path.parent.mkdir(parents=True, exist_ok=True)
    breakdown_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    step_end("Breakdown", outputs=[breakdown_path], cache_hits=0, cache_misses=1)
    return valid_nuggets
