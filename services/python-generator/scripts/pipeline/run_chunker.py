#!/usr/bin/env python3
"""
Chunk a transcript into scenes for a faceless short (TTS + mascot images).
Called by run_pipeline. Outputs to cache/{config_hash}/videos/{cache_key}/chunks.json.
"""

import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from models import Chunks, ChunksOutput, Scene
from schema_utils import schema_for_openai

from path_utils import env_path, prompts_dir, video_cache_path
from logger import cache_hit, cache_miss, error, step_end, step_start
from usage_trace import record_llm

load_dotenv(env_path())


def _load_system_prompt(prompt_filename: str) -> str:
    """Load the chunker system prompt."""
    prompt_path = prompts_dir() / prompt_filename
    if not prompt_path.exists():
        error(f"Error: System prompt not found at {prompt_path}")
        sys.exit(1)
    return prompt_path.read_text(encoding="utf-8")


def _extract_transcript(script: str) -> str:
    """Extract transcript from [HOOK] to end. Strips [PLANNING] or other prefatory content."""
    match = re.search(r"\[HOOK\][\s\S]*", script, re.IGNORECASE)
    return match.group(0).strip() if match else script


def _extract_json(content: str) -> str:
    """Extract JSON from response (handle markdown code blocks)."""
    content = content.strip()
    if content.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            return match.group(1).strip()
    return content


def _chunk_transcript(transcript: str, model: str, system_prompt: str) -> Chunks:
    """Call the LLM to chunk the transcript into scenes using structured output."""
    schema = ChunksOutput.model_json_schema()
    schema = schema_for_openai(schema)
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": schema.get("title", "ChunksOutput"),
            "strict": True,
            "schema": schema,
        },
    }

    try:
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Chunk this transcript into scenes. Respond with valid JSON only.\n\n{transcript}"},
            ],
            response_format=response_format,
            temperature=0.5,
        )
        content = (response.choices[0].message.content or "").strip()
        content = _extract_json(content)
        parsed = ChunksOutput.model_validate_json(content)
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("Chunks", model, u.prompt_tokens, u.completion_tokens)
        return Chunks(
            title=parsed.title,
            description=parsed.description,
            scenes=[
                Scene(
                    text=s.text,
                    imagery=s.imagery,
                    section=s.section,
                    transition_from_previous=s.transition_from_previous,
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
    config,
    config_hash: str,
    skip_cache: bool = False,
) -> Chunks:
    """
    Chunk script into scenes. Uses cache if available.
    Output: cache/{config_hash}/videos/{cache_key}/chunks.json
    """
    step_start("Chunks")
    chunks_path = video_cache_path(cache_key, config_hash, "chunks.json")

    if not skip_cache and chunks_path.exists():
        cache_hit(chunks_path)
        step_end("Chunks", outputs=[chunks_path], cache_hits=1, cache_misses=0)
        return Chunks.model_validate(json.loads(chunks_path.read_text(encoding="utf-8")))

    cache_miss("chunking...")
    transcript = _extract_transcript(script)
    system_prompt = _load_system_prompt(config.chunk.system_prompt)
    chunks = _chunk_transcript(transcript, config.chunk.model, system_prompt)
    chunks_path.parent.mkdir(parents=True, exist_ok=True)
    chunks_path.write_text(chunks.model_dump_json(indent=2), encoding="utf-8")
    step_end("Chunks", outputs=[chunks_path], cache_hits=0, cache_misses=1)
    return chunks
