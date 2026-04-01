"""LLM-based source breakdown with structured JSON output and full post-process."""

import re
import sys
from typing import Any, cast

from litellm import completion

from models import BreakdownOutput
from schema_utils import schema_for_openai

from chunker.post_process import post_process_llm
from chunker.text import content_cache_key, extract_lines, word_count
from logger import error
from path_utils import breakdown_dir, breakdown_raw_path, prompts_dir
from usage_trace import record_llm


def _add_line_numbers_and_word_counts(content: str) -> str:
    """Prefix each line with line number and word count: line_num|word_count|sentence."""
    lines = content.splitlines()
    return "\n".join(
        f"{i + 1}|{word_count(line)}|{line}" for i, line in enumerate(lines)
    )


def _extract_json(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            return match.group(1).strip()
    return content


def _load_system_prompt(prompt_filename: str) -> str:
    prompt_path = prompts_dir() / prompt_filename
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
    return prompt_path.read_text(encoding="utf-8")


class LlmSourceChunker:
    def chunk(
        self,
        sentence_content: str,
        config,
        max_nuggets: int = 10,
        *,
        source_key: str,
    ) -> BreakdownOutput:
        bd = config.breakdown
        system_prompt = _load_system_prompt(bd.system_prompt)
        numbered_source = _add_line_numbers_and_word_counts(sentence_content)
        user_content = (
            "Break down this source. Format: each line is line_num|word_count|sentence.\n\n"
            f"\n\nOutput at most {max_nuggets} nugget(s). "
            "Prioritize the most important or representative ideas."
        )
        user_content += f"\n\n{numbered_source}"

        schema = BreakdownOutput.model_json_schema()
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
                    model=bd.model,
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
                record_llm("Breakdown", bd.model, u.prompt_tokens, u.completion_tokens)
        except Exception as e:
            error(f"Error calling LLM: {e}")
            sys.exit(1)

        for n in parsed.nuggets:
            n.original_text = extract_lines(sentence_content, n.start_line, n.end_line)
            n.cache_key = content_cache_key(n.original_text or "")
            n.word_count = word_count(n.original_text or "")

        pre_post = BreakdownOutput.model_validate(parsed.model_dump())
        breakdown_raw_path(source_key).write_text(
            pre_post.model_dump_json(indent=2),
            encoding="utf-8",
        )

        parsed.nuggets = post_process_llm(parsed.nuggets, sentence_content)

        prompt_path = breakdown_dir(source_key) / "breakdown_llm_prompt.md"
        prompt_path.write_text(
            f"# System\n\n{system_prompt}\n\n# User\n\n{user_content}",
            encoding="utf-8",
        )

        return parsed
