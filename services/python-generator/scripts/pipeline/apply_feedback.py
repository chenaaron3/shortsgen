"""
Apply human feedback to script and scenes. Revises Chunks based on script-level and per-scene feedback.
Called by Update Clip With Feedback Lambda.
"""

import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from models import Chunks, ChunksOutput, Scene
from schema_utils import schema_for_openai

from path_utils import env_path
from logger import error
from usage_trace import record_llm

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
    *,
    script_feedback: str | None = None,
    scene_feedback: list[dict] | None = None,
    model: str = "gpt-4o",
    config=None,
) -> Chunks:
    """
    Apply user feedback to revise scenes. Returns modified Chunks.
    """
    if config:
        model = config.chunk.model
    system_prompt = (
        "You revise short-form video scenes based on user feedback. "
        "Output valid JSON matching the schema: title, description, scenes (each: text, imagery, section, transition_from_previous). "
        "Imagery must be under 200 chars. Section is Hook, Body, or Close."
    )
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
    user_content = _build_feedback_prompt(script, chunks, script_feedback, scene_feedback)
    try:
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format=response_format,
            temperature=0.5,
        )
        content = (response.choices[0].message.content or "").strip()
        content = _extract_json(content)
        parsed = ChunksOutput.model_validate_json(content)
        if getattr(response, "usage", None):
            u = response.usage
            record_llm("ApplyFeedback", model, u.prompt_tokens, u.completion_tokens)
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
        error(f"Error applying feedback: {e}")
        raise
