#!/usr/bin/env python3
"""
Generate a short video script from raw content using an LLM.
Called by run_pipeline. Outputs to cache/{cache_key}/script.md.
"""

import hashlib
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from path_utils import env_path, prompts_dir, cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start
from usage_trace import record_llm

load_dotenv(env_path())

def load_system_prompt() -> str:
    """Load the system prompt from the prompts directory."""
    prompt_path = prompts_dir() / "short-script-system-prompt.md"
    
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
        
    return prompt_path.read_text(encoding="utf-8")

def generate_script(client: OpenAI, raw_content: str, model: str = "gpt-4o") -> str:
    """Call the LLM to generate the script."""
    system_prompt = load_system_prompt()
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is the raw content to adapt:\n\n{raw_content}"}
            ],
            temperature=0.7,
        )
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Script", model, u.prompt_tokens, u.completion_tokens)
        return response.choices[0].message.content or ""
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)

def save_output(content: str, output_dir: Path) -> Path:
    """Save the generated script to a file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = output_dir / f"script_{timestamp}.md"
    filename.write_text(content, encoding="utf-8")
    return filename


def run(
    raw_content: str,
    cache_key: str,
    model: str = "gpt-4o",
    skip_cache: bool = False,
) -> str:
    """
    Generate script from raw content. Uses cache if available.
    cache_key = hash of raw content. Output: cache/{cache_key}/script.md
    skip_cache: if True, regenerate even when cached (for --step 1 iteration).
    """
    step_start("Script")
    script_path = cache_path(cache_key, "script.md")

    if not skip_cache and script_path.exists():
        cache_hit(script_path)
        step_end("Script", outputs=[script_path], cache_hits=1, cache_misses=0)
        return script_path.read_text(encoding="utf-8")

    cache_miss("generating...")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found")
    client = OpenAI(api_key=api_key)

    script = generate_script(client, raw_content, model)
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(script, encoding="utf-8")
    step_end("Script", outputs=[script_path], cache_hits=0, cache_misses=1)
    return script
