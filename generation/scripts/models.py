"""Pydantic models for pipeline data structures."""

from typing import Literal

from pydantic import BaseModel, Field


class Scene(BaseModel):
    """A single scene in a chunked transcript."""

    text: str = Field(..., description="Spoken words for this scene")
    imagery: str = Field(..., description="Visual description for image generation")
    section: Literal["Hook", "Body", "Close"] = Field(
        ..., description="Section of the script"
    )
    image_path: str | None = Field(
        default=None,
        description="Path to generated image (set after generation)",
    )
    voice_path: str | None = Field(
        default=None,
        description="Path to generated voice (set after generation)",
    )


class Chunks(BaseModel):
    """Chunked transcript with scenes for faceless short generation."""

    scenes: list[Scene] = Field(..., description="Scenes to generate")
    title: str = Field(default="", description="YouTube-friendly title (from chunker or fallback)")
    description: str = Field(default="", description="Short description for upload metadata")


class SceneOutput(BaseModel):
    """LLM output for a single scene (text, imagery, section only)."""

    text: str = Field(..., description="Spoken words for this scene")
    imagery: str = Field(..., description="Visual description for image generation")
    section: Literal["Hook", "Body", "Close"] = Field(
        ..., description="Section of the script"
    )


class ChunksOutput(BaseModel):
    """LLM structured output for chunked transcript."""

    title: str = Field(..., description="Short YouTube-friendly title for the short (under ~60 chars)")
    description: str = Field(..., description="1-2 sentences for the short's description (YouTube description)")
    scenes: list[SceneOutput] = Field(..., description="Scenes to generate")
