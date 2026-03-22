"""Pydantic models for pipeline data structures."""

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, RootModel


class Scene(BaseModel):
    """A single scene in a chunked transcript."""

    text: str = Field(..., description="Spoken words for this scene")
    imagery: str = Field(..., description="Visual description for image generation")
    section: Literal["Hook", "Body", "Close"] = Field(
        ..., description="Section of the script"
    )
    transition_from_previous: bool = Field(
        default=False,
        description="If true, generate from previous scene's image; imagery describes the modification only",
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


class ProcessedClip(BaseModel):
    """Result of processing one nugget: script + chunker output. Used by initial_processing handler."""

    videoId: str = Field(..., description="Video ID in DB")
    script: str = Field(..., description="Generated script markdown")
    chunks: Chunks = Field(..., description="Chunked scenes")
    cacheKey: str = Field(..., description="Content cache key")


class SceneOutput(BaseModel):
    """LLM output for a single scene (text, imagery, section only)."""

    text: str = Field(..., description="Spoken words for this scene")
    imagery: str = Field(
        ...,
        max_length=200,
        description="Visual description for image generation (max 200 chars)",
    )
    section: Literal["Hook", "Body", "Close"] = Field(
        ..., description="Section of the script"
    )
    transition_from_previous: bool = Field(
        default=False,
        description="If true, generate from previous scene's image; imagery describes the modification only",
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
    start_line: int = Field(..., description="Start line number (1-indexed, inclusive)")
    end_line: int = Field(..., description="End line number (1-indexed, inclusive)")
    source_ref: SourceRef | None = Field(default=None, description="Location in source")
    original_text: str | None = Field(default=None, description="Extracted text from source (populated after LLM output)")
    cache_key: str | None = Field(default=None, description="Pipeline cache key: first 16 chars of SHA256(original_text); set when writing breakdown.json")
    word_count: int | None = Field(default=None, description="Word count of original_text")


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


# Script judge results (engagement, clarity, payoff)
# JSON uses "pass" as key; Python attribute is passed_


class DimensionScore(BaseModel):
    """Judge result for one dimension: pass/fail with critique and suggestion."""

    model_config = ConfigDict(populate_by_name=True)

    passed: bool = Field(
        validation_alias=AliasChoices("pass", "passed"),
        serialization_alias="pass",
        description="Pass or fail",
    )
    critique: str = Field(default="", description="Brief rationale")
    suggestion: str = Field(default="", description="Concrete suggested improvement")
    suggestion_reasoning: str = Field(default="", description="Why this suggestion would help")


class JudgeScore(BaseModel):
    """Judge scores for all three dimensions."""

    engagement: DimensionScore
    clarity: DimensionScore
    payoff: DimensionScore


class JudgeAttempt(BaseModel):
    """One script generation attempt with its judge result."""

    script: str
    judge: JudgeScore


class ScriptJudgeResults(BaseModel):
    """Full script-judge-results.json output."""

    generatedAt: str = Field(..., description="ISO timestamp")
    judgeModel: str = Field(..., description="Model used for judge")
    judge: JudgeScore = Field(..., description="Selected or sole judge result")
    allPass: bool = Field(..., description="Whether all dimensions passed")
    attempts: list[JudgeAttempt] | None = Field(default=None, description="All attempts when judge_gate")
    selectedIndex: int | None = Field(default=None, description="Index of selected attempt when judge_gate")


class PairwiseJudgeOutput(BaseModel):
    """Structured output for pairwise script judge: A or B."""

    winner: Literal["A", "B"] = Field(
        ...,
        description="Which script performs better with viewers: A or B",
    )
    reason: str = Field(
        default="",
        description="Brief reason why this script wins (1-2 sentences, for prompt tuning).",
    )


class PairwiseJudgeResult(BaseModel):
    """One pairwise comparison result from batch evaluation."""

    video_id_a: str | None = Field(default=None, description="Video ID for script A")
    video_id_b: str | None = Field(default=None, description="Video ID for script B")
    script_a: str = Field(default="", description="Transcript for script A")
    script_b: str = Field(default="", description="Transcript for script B")
    gold: Literal["A", "B"] = Field(..., description="Ground-truth winner from view counts")
    pred: Literal["A", "B"] = Field(..., description="Judge prediction")
    reason: str = Field(default="", description="Judge rationale")
    correct: bool = Field(..., description="Whether pred matches gold")


class PairwiseBatchOutput(BaseModel):
    """Output of run_batch: accuracy and per-example results."""

    accuracy: float = Field(..., description="Fraction of correct predictions")
    correct: int = Field(..., description="Number of correct predictions")
    total: int = Field(..., description="Total number of examples")
    results: list[PairwiseJudgeResult] = Field(..., description="Per-example results")
