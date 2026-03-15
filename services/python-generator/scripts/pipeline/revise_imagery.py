"""
Revise imagery for a single scene based on feedback. Outputs only the imagery string.
Used by Update Imagery Lambda when feedback path (LLM revision) is requested.
"""

from typing import Any, cast

from dotenv import load_dotenv
from litellm import completion

from config_loader import Config

from path_utils import env_path
from logger import error

load_dotenv(env_path())


def revise_single_scene_imagery(
    scene_text: str,
    current_imagery: str,
    feedback: str,
    config: Config,
) -> str:
    """
    Revise imagery for one scene based on user feedback. Returns the new imagery string.
    Output is plain text (imagery only), max 200 characters.
    """
    model = config.chunk.model
    system_prompt = (
        "You revise the visual imagery description for a single short-form video scene. "
        "Output only the revised imagery string. No JSON, no quotes, no explanation. Max 200 characters."
    )
    user_content = (
        f"Scene text (spoken): {scene_text}\n\n"
        f"Current imagery: {current_imagery}\n\n"
        f"User feedback: {feedback}\n\n"
        "Output only the revised imagery string."
    )
    try:
        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            stream=False,
        )
        content = (cast(Any, response).choices[0].message.content or "").strip()[:200]
        return content
    except Exception as e:
        error(f"Error revising imagery: {e}")
        raise
