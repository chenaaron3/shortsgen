#!/usr/bin/env python3
"""
Generate a short video script from raw content using an LLM.
Called by run_pipeline. Outputs to cache/{config_hash}/videos/{cache_key}/script.md.
"""

import sys
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from path_utils import env_path, prompts_dir, video_cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start
from usage_trace import record_llm

load_dotenv(env_path())


def _load_system_prompt(prompt_filename: str) -> str:
    """Load the system prompt from the prompts directory."""
    prompt_path = prompts_dir() / prompt_filename
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
    return prompt_path.read_text(encoding="utf-8")


def _generate_script(raw_content: str, model: str, system_prompt: str, temperature: float = 0.7) -> str:
    """Call the LLM to generate the script."""
    try:
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is the raw content to adapt:\n\n{raw_content}"},
            ],
            temperature=temperature,
        )
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Script", model, u.prompt_tokens, u.completion_tokens)
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)


def run(
    raw_content: str,
    cache_key: str,
    config,
    config_hash: str,
    skip_cache: bool = False,
) -> str:
    """
    Generate script from raw content. Uses cache if available.
    Output: cache/{config_hash}/videos/{cache_key}/script.md
    """
    step_start("Script")
    script_path = video_cache_path(cache_key, config_hash, "script.md")

    if not skip_cache and script_path.exists():
        cache_hit(script_path)
        step_end("Script", outputs=[script_path], cache_hits=1, cache_misses=0)
        return script_path.read_text(encoding="utf-8")

    cache_miss("generating...")
    system_prompt = _load_system_prompt(config.script.system_prompt)
    temperature = config.script.temperature if config.script.temperature is not None else 0.7
    script = _generate_script(raw_content, config.script.model, system_prompt, temperature)
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(script, encoding="utf-8")
    step_end("Script", outputs=[script_path], cache_hits=0, cache_misses=1)
    return script
