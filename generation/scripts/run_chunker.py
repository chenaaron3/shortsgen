#!/usr/bin/env python3
"""
Chunk a transcript into scenes for a faceless short (TTS + mascot images).
Called by run_pipeline. Outputs to cache/{cache_key}/chunks.json.
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from models import Chunks, ChunksOutput, Scene

from path_utils import env_path, prompts_dir, cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start
from usage_trace import record_llm

load_dotenv(env_path())


def load_system_prompt() -> str:
    """Load the chunker system prompt."""
    prompt_path = prompts_dir() / "transcript-chunker-system-prompt.md"

    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)

    return prompt_path.read_text(encoding="utf-8")


def chunk_transcript(client: OpenAI, transcript: str, model: str = "gpt-4o") -> Chunks:
    """Call the LLM to chunk the transcript into scenes using structured output."""
    system_prompt = load_system_prompt()

    try:
        completion = client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Chunk this transcript into scenes:\n\n{transcript}"},
            ],
            response_format=ChunksOutput,
            temperature=0.5,
        )
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            error("Error: LLM refused or returned empty response.")
            sys.exit(1)
        if getattr(completion, "usage", None):
            u = completion.usage
            record_llm("Chunks", model, u.prompt_tokens, u.completion_tokens)
        # Convert ChunksOutput to Chunks (add image_path, voice_path to each scene; pass title/description)
        return Chunks(
            title=parsed.title,
            description=parsed.description,
            scenes=[
                Scene(
                    text=s.text,
                    imagery=s.imagery,
                    section=s.section,
                    image_path=None,
                    voice_path=None,
                )
                for s in parsed.scenes
            ],
        )
    except Exception as e:
        error(f"Error calling LLM: {e}")
        sys.exit(1)


def run(
    script: str,
    cache_key: str,
    model: str = "gpt-4o",
    skip_cache: bool = False,
) -> Chunks:
    """
    Chunk script into scenes. Uses cache if available.
    cache_key = same as script (1:1). Output: cache/{cache_key}/chunks.json
    skip_cache: if True, regenerate even when cached (for --step 2 iteration).
    """
    step_start("Chunks")
    chunks_path = cache_path(cache_key, "chunks.json")

    if not skip_cache and chunks_path.exists():
        cache_hit(chunks_path)
        step_end("Chunks", outputs=[chunks_path], cache_hits=1, cache_misses=0)
        return Chunks.model_validate(json.loads(chunks_path.read_text(encoding="utf-8")))

    cache_miss("chunking...")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found")
    client = OpenAI(api_key=api_key)

    chunks = chunk_transcript(client, script, model)
    chunks_path.parent.mkdir(parents=True, exist_ok=True)
    chunks_path.write_text(chunks.model_dump_json(indent=2), encoding="utf-8")
    step_end("Chunks", outputs=[chunks_path], cache_hits=0, cache_misses=1)
    return chunks
