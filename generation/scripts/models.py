"""Pydantic models for pipeline data structures."""

from typing import Literal

from pydantic import BaseModel, Field, RootModel


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


class SourceRef(BaseModel):
    """Reference to source location (chapter, section, timestamp, etc.)."""

    chapter: str | None = Field(default=None, description="Chapter or section number")
    section: str | None = Field(default=None, description="Section or heading name")
    timestamp: str | None = Field(default=None, description="Timestamp (for podcast/transcript)")


class Nugget(BaseModel):
    """One atomic idea from source material, pipeline-ready."""

    id: str = Field(..., description="Unique slug, e.g. atomic-habits-001")
    title: str = Field(..., description="Short descriptive title for the idea")
    summary: str = Field(..., description="150-300 word self-contained summary, fed to script generator")
    source_ref: SourceRef | None = Field(default=None, description="Location in source")
    cache_key: str | None = Field(default=None, description="Pipeline cache key: first 16 chars of SHA256(summary); set when writing breakdown.json")


class BreakdownOutput(BaseModel):
    """LLM structured output for source breakdown."""

    nuggets: list[Nugget] = Field(
        ...,
        description="Atomic idea nuggets extracted from source",
    )


class UploadStateEntry(BaseModel):
    """One video's YouTube upload state (scheduled time and video id)."""

    scheduled_at: str = Field(..., description="RFC 3339 publish time")
    video_id: str = Field(..., description="YouTube video ID")


class UploadState(RootModel[dict[str, UploadStateEntry]]):
    """Upload state for a breakdown: cache_key -> entry. Persisted as upload_state.json (flat dict)."""
