"""
Apply human feedback to script and scenes. Revises Chunks based on script-level and per-scene feedback.
Called by Update Clip With Feedback Lambda.

Requires on_partial callback for streaming. Emits partial LLM output as tokens arrive so the client
can optimistically display progress (feedback_partial events).

Uses OpenAI client directly for streaming + structured output (litellm has known issues with this combo).
Requires an OpenAI model (e.g. gpt-4o) in config.chunk.model.
"""

import os
import re
from collections.abc import Callable
from typing import cast

from dotenv import load_dotenv
from json_repair import repair_json
from openai import OpenAI
from openai.types.chat import completion_create_params

from config_loader import Config
from models import Chunks, ChunksOutput, Scene
from schema_utils import schema_for_openai

from path_utils import env_path
from logger import error

load_dotenv(env_path())


def _extract_json(content: str) -> str:
    """Extract JSON from response (handle markdown code blocks)."""
    content = content.strip()
    if content.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            return match.group(1).strip()
    return content


def _build_feedback_prompt(
    script: str,
    chunks: Chunks,
    script_feedback: str | None = None,
    scene_feedback: list[dict] | None = None,
) -> str:
    """Build the revision prompt from user feedback."""
    parts = [
        "You are revising a short-form video script and its scenes based on user feedback.",
        "Output valid JSON matching the ChunksOutput schema: title, description, scenes (each with text, imagery, section, transition_from_previous).",
        "",
        "--- SCRIPT ---",
        script,
        "",
        "--- CURRENT SCENES ---",
    ]
    for i, s in enumerate(chunks.scenes):
        parts.append(f"Scene {i}: [{s.section}] {s.text}")
        parts.append(f"  Imagery: {s.imagery}")
    parts.append("")
    parts.append("--- USER FEEDBACK ---")
    if script_feedback:
        parts.append(f"Overall script feedback: {script_feedback}")
    if scene_feedback:
        for item in scene_feedback:
            idx = item.get("sceneIndex", item.get("scene_index", 0))
            fb = item.get("feedback", item.get("feedback", ""))
            parts.append(f"Scene {idx}: {fb}")
    if not script_feedback and not scene_feedback:
        parts.append("(No specific feedback provided; make minor improvements if needed.)")
    parts.append("")
    parts.append(
        "Revise the scenes to address the feedback. Preserve structure (same number of scenes, same sections). "
        "Output valid JSON only."
    )
    return "\n".join(parts)


def apply_feedback(
    script: str,
    chunks: Chunks,
    config: Config,
    *,
    script_feedback: str | None = None,
    scene_feedback: list[dict] | None = None,
    on_partial: Callable[[str], None],
) -> Chunks:
    """
    Apply user feedback to revise scenes. Returns modified Chunks.

    Streams LLM output and calls on_partial(accumulated_content) for each chunk.
    Enables client to show feedback_partial events optimistically.
    """
    model = config.chunk.model
    system_prompt = (
        "You revise short-form video scenes based on user feedback. "
        "Output valid JSON matching the schema: title, description, scenes (each: text, imagery, section, transition_from_previous). "
        "Imagery must be under 200 chars. Section is Hook, Body, or Close."
    )
    user_content = _build_feedback_prompt(script, chunks, script_feedback, scene_feedback)
    return _apply_feedback_streaming(
        model=model,
        system_prompt=system_prompt,
        user_content=user_content,
        on_partial=on_partial,
    )


def _openai_model(model: str) -> str:
    """Normalize model name for OpenAI SDK (strip provider prefix if present)."""
    if model.startswith("openai/"):
        return model[len("openai/") :]
    return model


def _apply_feedback_streaming(
    *,
    model: str,
    system_prompt: str,
    user_content: str,
    on_partial: Callable[[str], None],
) -> Chunks:
    """
    Stream LLM response with structured output via OpenAI client.
    Uses response_format + stream=True (OpenAI supports this; litellm has issues).
    """
    openai_model = _openai_model(model)
    if not openai_model.startswith(("gpt-", "o1-", "o3-")):
        openai_model = "gpt-4o"

    schema = ChunksOutput.model_json_schema()
    schema = schema_for_openai(schema)
    response_format = cast(
        completion_create_params.ResponseFormat,
        {
            "type": "json_schema",
            "json_schema": {
                "name": schema.get("title", "ChunksOutput"),
                "strict": True,
                "schema": schema,
            },
        },
    )

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    accumulated = ""
    try:
        stream = client.chat.completions.create(
            model=openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format=response_format,
            temperature=0.5,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    accumulated += delta
                    # Emit when we have valid JSON (repair_json is no-op if already valid)
                    content = _extract_json(accumulated.strip())
                    if not content:
                        continue
                    try:
                        repaired = repair_json(content, logging=False)
                        if repaired:
                            ChunksOutput.model_validate_json(repaired)
                            on_partial(repaired)
                    except Exception:
                        pass
        content = _extract_json(accumulated.strip())
        try:
            parsed = ChunksOutput.model_validate_json(content)
        except Exception:
            content = cast(str, repair_json(content, logging=False)) or content
            parsed = ChunksOutput.model_validate_json(content)
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
        error(f"Error applying feedback (streaming): {e}")
        raise
