"""Trace API usage (LLM, image, voice) for cost visibility.

All recording is thread-safe. Call reset() at the start of a pipeline run,
then record_* from each step; print_summary() at the end.
"""

import threading
from dataclasses import dataclass


@dataclass
class LLMUsage:
    step: str
    model: str
    prompt_tokens: int
    completion_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class ImageUsage:
    step: str
    model: str
    count: int


@dataclass
class VoiceUsage:
    step: str
    model_id: str
    characters: int


_lock = threading.Lock()
_llm: list[LLMUsage] = []
_images: list[ImageUsage] = []
_voice: list[VoiceUsage] = []


def reset() -> None:
    """Clear all recorded usage (call at start of a pipeline run)."""
    with _lock:
        _llm.clear()
        _images.clear()
        _voice.clear()


def record_llm(step: str, model: str, prompt_tokens: int, completion_tokens: int) -> None:
    """Record one LLM (chat completion) call."""
    with _lock:
        _llm.append(
            LLMUsage(
                step=step,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        )


def record_image(step: str, model: str, count: int = 1) -> None:
    """Record image generation (e.g. one call = one image)."""
    with _lock:
        _images.append(ImageUsage(step=step, model=model, count=count))


def record_voice(step: str, model_id: str, characters: int) -> None:
    """Record voice/TTS usage (character count)."""
    with _lock:
        _voice.append(VoiceUsage(step=step, model_id=model_id, characters=characters))


def get_trace() -> dict:
    """Return full trace for serialization (e.g. JSON)."""
    with _lock:
        return {
            "llm": [
                {
                    "step": u.step,
                    "model": u.model,
                    "prompt_tokens": u.prompt_tokens,
                    "completion_tokens": u.completion_tokens,
                    "total_tokens": u.total_tokens,
                }
                for u in _llm
            ],
            "images": [
                {"step": u.step, "model": u.model, "count": u.count}
                for u in _images
            ],
            "voice": [
                {"step": u.step, "model_id": u.model_id, "characters": u.characters}
                for u in _voice
            ],
            "totals": {
                "llm": {
                    "calls": len(_llm),
                    "prompt_tokens": sum(u.prompt_tokens for u in _llm),
                    "completion_tokens": sum(u.completion_tokens for u in _llm),
                    "total_tokens": sum(u.total_tokens for u in _llm),
                },
                "images": {
                    "calls": len(_images),
                    "images": sum(u.count for u in _images),
                },
                "voice": {
                    "calls": len(_voice),
                    "characters": sum(u.characters for u in _voice),
                },
            },
        }


def print_summary() -> None:
    """Print a human-readable usage summary to stdout."""
    trace = get_trace()
    llm = trace["totals"]["llm"]
    images = trace["totals"]["images"]
    voice = trace["totals"]["voice"]

    if llm["calls"] == 0 and images["images"] == 0 and voice["calls"] == 0:
        return

    lines = [
        "",
        "📊 Usage (this run)",
        "─" * 40,
    ]

    if llm["calls"]:
        lines.append("  OpenAI Text (LLM)")
        for u in trace["llm"]:
            lines.append(
                f"    {u['step']}: {u['total_tokens']} tokens "
                f"(prompt {u['prompt_tokens']}, completion {u['completion_tokens']}) — {u['model']}"
            )
        lines.append(
            f"    Total: {llm['total_tokens']} tokens ({llm['calls']} call(s))"
        )
        lines.append("")

    if images["images"]:
        lines.append("  OpenAI Image Gen")
        by_step: dict[str, list] = {}
        for u in trace["images"]:
            by_step.setdefault(u["step"], []).append(u)
        for step, us in by_step.items():
            total = sum(x["count"] for x in us)
            model = us[0]["model"] if us else "?"
            lines.append(f"    {step}: {total} image(s) — {model}")
        lines.append(f"    Total: {images['images']} image(s)")
        lines.append("")

    if voice["calls"]:
        lines.append("  ElevenLabs Voice Gen")
        for u in trace["voice"]:
            lines.append(f"    {u['step']}: {u['characters']} chars — {u['model_id']}")
        lines.append(
            f"    Total: {voice['characters']} characters ({voice['calls']} call(s))"
        )

    print("\n".join(lines), flush=True)
