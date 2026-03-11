"""Trace API usage (LLM, image, voice) for cost visibility.

Usage is keyed by (config_hash, cache_key) so concurrent pipeline runs don't mix data.
Call set_context(cache_key, config_hash) at the start of a pipeline run, then record_*
from each step. flush_traces_to_disk() writes in-memory usage to usage.json before
summary printing. Summary functions read exclusively from disk.

Usage.json is cumulative: when re-running only some steps (e.g. --step image),
existing llm/voice data is preserved and only the re-run step is updated.
"""

import contextvars
import json
import threading
from pathlib import Path

from pydantic import BaseModel, Field, computed_field
from path_utils import video_cache_path

# Model pricing: (input $/1M tokens, output $/1M tokens) for LLM; $/image for images; $/1K chars for voice.
# Use prefix matching; first match wins.
_LLM_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-4": (30.00, 60.00),
    "claude-sonnet": (3.00, 15.00),
    "claude-opus": (15.00, 75.00),
    "claude-haiku": (0.25, 1.25),
}
_IMAGE_PRICES: dict[str, float] = {
    "bytedance/hyper-flux-8step": 0.003,
    "bytedance/hyper-flux-16step": 0.004,
    "openai/gpt-image-1-mini": 0.04,
    "gpt-image-1-mini": 0.04,
    "openai/gpt-image-1": 0.036,
    "gpt-image-1": 0.036,
    "google/gemini": 0.02,
}
_VOICE_PRICES: dict[str, float] = {
    "ttsvibes": 0.0,  # prototype mode: free TTS
    "eleven_v3": 0.12,
    "eleven_multilingual_v2": 0.18,
    "eleven_turbo_v2": 0.06,
    "eleven_flash_v2": 0.06,
}


class LLMUsage(BaseModel):
    step: str
    model: str
    prompt_tokens: int
    completion_tokens: int

    @computed_field
    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class ImageUsage(BaseModel):
    step: str
    model: str
    count: int


class VoiceUsage(BaseModel):
    step: str
    model_id: str
    characters: int


class LlmTotals(BaseModel):
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ImagesTotals(BaseModel):
    calls: int = 0
    images: int = 0


class VoiceTotals(BaseModel):
    calls: int = 0
    characters: int = 0


class UsageTotals(BaseModel):
    """Aggregate counts for llm, images, voice."""

    llm: LlmTotals = Field(default_factory=LlmTotals)
    images: ImagesTotals = Field(default_factory=ImagesTotals)
    voice: VoiceTotals = Field(default_factory=VoiceTotals)


class UsageEstimate(BaseModel):
    """Cost estimate in USD."""

    llm_usd: float = 0.0
    images_usd: float = 0.0
    voice_usd: float = 0.0
    total_usd: float = 0.0


class UsageTrace(BaseModel):
    """Schema for usage.json on disk. Cumulative API usage per (config_hash, cache_key)."""

    llm: list[LLMUsage] = Field(default_factory=list)
    images: list[ImageUsage] = Field(default_factory=list)
    voice: list[VoiceUsage] = Field(default_factory=list)
    totals: UsageTotals = Field(default_factory=UsageTotals)
    estimate: UsageEstimate = Field(default_factory=UsageEstimate)

    def to_trace_dict(self) -> dict:
        """Convert to dict format expected by print_summary and compute_cost_estimate."""
        return {
            "llm": self.llm,
            "images": self.images,
            "voice": self.voice,
            "totals": self.totals.model_dump(),
        }


_lock = threading.Lock()
# Key: (config_hash, cache_key). Value: {llm: [], images: [], voice: []}
_usage: dict[tuple[str, str], dict] = {}
_current_key: contextvars.ContextVar[tuple[str, str] | None] = contextvars.ContextVar(
    "usage_trace_key", default=None
)


def _ensure_key(key: tuple[str, str]) -> dict:
    """Get or create usage dict for key."""
    if key not in _usage:
        _usage[key] = {"llm": [], "images": [], "voice": []}
    return _usage[key]


def get_context() -> tuple[str, str] | None:
    """Return current (config_hash, cache_key) or None. Use to propagate key into worker threads."""
    return _current_key.get()


def set_context(cache_key: str, config_hash: str, *, clear: bool = True) -> None:
    """Set the current run's key. If clear=True (default), reset that key's data. Use clear=False in workers."""
    key = (config_hash, cache_key)
    with _lock:
        _ensure_key(key)
        if clear:
            _usage[key] = {"llm": [], "images": [], "voice": []}
    _current_key.set(key)


def reset(cache_key: str | None = None, config_hash: str | None = None) -> None:
    """Clear recorded usage. With args: alias for set_context. Without: clear current key."""
    if cache_key is not None and config_hash is not None:
        set_context(cache_key, config_hash)
        return
    key = _current_key.get()
    if key:
        with _lock:
            if key in _usage:
                _usage[key] = {"llm": [], "images": [], "voice": []}


def record_llm(step: str, model: str, prompt_tokens: int, completion_tokens: int) -> None:
    """Record one LLM (chat completion) call."""
    key = _current_key.get() or ("_default", "_default")
    with _lock:
        data = _ensure_key(key)
        data["llm"].append(
            LLMUsage(
                step=step,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        )


def record_image(step: str, model: str, count: int = 1) -> None:
    """Record image generation (e.g. one call = one image)."""
    key = _current_key.get() or ("_default", "_default")
    with _lock:
        data = _ensure_key(key)
        data["images"].append(ImageUsage(step=step, model=model, count=count))


def record_voice(step: str, model_id: str, characters: int) -> None:
    """Record voice/TTS usage (character count)."""
    key = _current_key.get() or ("_default", "_default")
    with _lock:
        data = _ensure_key(key)
        data["voice"].append(VoiceUsage(step=step, model_id=model_id, characters=characters))


def _trace_from_data(data: dict) -> dict:
    """Build trace dict from raw llm/images/voice lists. Keeps model instances (not dicts)."""
    llm = data.get("llm", [])
    images = data.get("images", [])
    voice = data.get("voice", [])
    return {
        "llm": list(llm),
        "images": list(images),
        "voice": list(voice),
        "totals": {
            "llm": {
                "calls": len(llm),
                "prompt_tokens": sum(u.prompt_tokens for u in llm),
                "completion_tokens": sum(u.completion_tokens for u in llm),
                "total_tokens": sum(u.total_tokens for u in llm),
            },
            "images": {"calls": len(images), "images": sum(u.count for u in images)},
            "voice": {
                "calls": len(voice),
                "characters": sum(u.characters for u in voice),
            },
        },
    }


def get_trace(key: tuple[str, str] | None = None) -> dict:
    """Return trace for key. If None, use current key; if no current, return empty trace."""
    if key is None:
        key = _current_key.get()
    if key is None:
        return _trace_from_data({"llm": [], "images": [], "voice": []})
    with _lock:
        data = _usage.get(key, {"llm": [], "images": [], "voice": []})
    return _trace_from_data(data)


def _llm_entry_cost(entry: LLMUsage) -> tuple[float, float | None, float | None]:
    """Return (usd, input_price_per_1M, output_price_per_1M). Prices are None if no match."""
    inp, out = entry.prompt_tokens, entry.completion_tokens
    sorted_llm = sorted(_LLM_PRICES.items(), key=lambda x: -len(x[0]))
    for prefix, (pi, po) in sorted_llm:
        if prefix in entry.model.lower():
            usd = (inp / 1_000_000) * pi + (out / 1_000_000) * po
            return (usd, pi, po)
    return (0.0, None, None)


def _image_entry_cost(entry: ImageUsage) -> tuple[float, float | None]:
    """Return (usd, price_per_image). Price is None if no match."""
    sorted_img = sorted(_IMAGE_PRICES.items(), key=lambda x: -len(x[0]))
    for prefix, p in sorted_img:
        if prefix in entry.model.lower():
            return (entry.count * p, p)
    return (0.0, None)


def _voice_entry_cost(entry: VoiceUsage) -> tuple[float, float | None]:
    """Return (usd, price_per_1k_chars). Price is None if no match."""
    sorted_voice = sorted(_VOICE_PRICES.items(), key=lambda x: -len(x[0]))
    for prefix, p in sorted_voice:
        if prefix in entry.model_id.lower():
            return ((entry.characters / 1000) * p, p)
    return (0.0, None)


def _compute_llm_cost(entries: list[LLMUsage]) -> float:
    total = 0.0
    sorted_llm = sorted(_LLM_PRICES.items(), key=lambda x: -len(x[0]))
    for u in entries:
        inp, out = u.prompt_tokens, u.completion_tokens
        for prefix, (pi, po) in sorted_llm:
            if prefix in u.model.lower():
                total += (inp / 1_000_000) * pi + (out / 1_000_000) * po
                break
    return total


def _compute_image_cost(entries: list[ImageUsage]) -> float:
    total = 0.0
    sorted_img = sorted(_IMAGE_PRICES.items(), key=lambda x: -len(x[0]))
    for u in entries:
        for prefix, p in sorted_img:
            if prefix in u.model.lower():
                total += u.count * p
                break
    return total


def _compute_voice_cost(entries: list[VoiceUsage]) -> float:
    total = 0.0
    sorted_voice = sorted(_VOICE_PRICES.items(), key=lambda x: -len(x[0]))
    for u in entries:
        for prefix, p in sorted_voice:
            if prefix in u.model_id.lower():
                total += (u.characters / 1000) * p
                break
    return total


def compute_cost_estimate(trace: dict) -> dict:
    """Compute cost estimate from trace. Returns {llm_usd, images_usd, voice_usd, total_usd}."""
    llm_cost = _compute_llm_cost(trace.get("llm", []))
    image_cost = _compute_image_cost(trace.get("images", []))
    voice_cost = _compute_voice_cost(trace.get("voice", []))
    return {
        "llm_usd": round(llm_cost, 4),
        "images_usd": round(image_cost, 4),
        "voice_usd": round(voice_cost, 4),
        "total_usd": round(llm_cost + image_cost + voice_cost, 4),
    }


def merge_trace(existing: dict | None, this_run: dict) -> dict:
    """Merge this run's trace into existing. Parses dicts from JSON into models; keeps model instances."""

    def _parse(key: str, model_cls: type) -> list:
        out = []
        for u in (existing or {}).get(key, []):
            try:
                out.append(model_cls.model_validate(u))
            except Exception:
                pass
        return out
    merged: dict = {
        "llm": _parse("llm", LLMUsage),
        "images": _parse("images", ImageUsage),
        "voice": _parse("voice", VoiceUsage),
        "totals": {"llm": {}, "images": {}, "voice": {}},
    }

    for key in ("llm", "images", "voice"):
        this_data = this_run.get(key, [])
        if this_data:
            merged[key] = this_data

    merged["totals"] = {
        "llm": {
            "calls": len(merged["llm"]),
            "prompt_tokens": sum(u.prompt_tokens for u in merged["llm"]),
            "completion_tokens": sum(u.completion_tokens for u in merged["llm"]),
            "total_tokens": sum(u.total_tokens for u in merged["llm"]),
        },
        "images": {
            "calls": len(merged["images"]),
            "images": sum(u.count for u in merged["images"]),
        },
        "voice": {
            "calls": len(merged["voice"]),
            "characters": sum(u.characters for u in merged["voice"]),
        },
    }
    return merged


def _build_trace_for_disk(existing: dict | None, this_run: dict) -> dict:
    """Build trace dict to write to disk: merge existing with this run, add cost estimate."""
    merged = merge_trace(existing, this_run)
    merged["estimate"] = compute_cost_estimate(merged)
    trace = UsageTrace(
        llm=merged["llm"],
        images=merged["images"],
        voice=merged["voice"],
        totals=UsageTotals.model_validate(merged["totals"]),
        estimate=UsageEstimate.model_validate(merged["estimate"]),
    )
    return trace.model_dump()


def _flush_key_to_disk(config_hash: str, cache_key: str) -> None:
    """Flush one key's in-memory trace to usage.json. No-op if in-memory is empty."""
    this_run = get_trace((config_hash, cache_key))
    totals = this_run["totals"]
    if (
        totals["llm"]["calls"] == 0
        and totals["images"]["images"] == 0
        and totals["voice"]["calls"] == 0
    ):
        return
    usage_path = video_cache_path(cache_key, config_hash, "usage.json")
    existing = None
    if usage_path.exists():
        try:
            existing = json.loads(usage_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    trace = _build_trace_for_disk(existing, this_run)
    usage_path.parent.mkdir(parents=True, exist_ok=True)
    usage_path.write_text(json.dumps(trace, indent=2), encoding="utf-8")


def flush_traces_for_key(config_hash: str, cache_key: str) -> None:
    """Flush in-memory usage for one key to usage.json. No-op if in-memory is empty."""
    _flush_key_to_disk(config_hash, cache_key)


def flush_traces_to_disk() -> None:
    """Flush all in-memory usage to usage.json. Only writes keys with non-empty data.
    Skips keys like _default and _breakdown that may not have valid cache paths.
    """
    with _lock:
        keys = list(_usage.keys())
    for config_hash, cache_key in keys:
        if config_hash in ("_default", "_breakdown"):
            continue
        _flush_key_to_disk(config_hash, cache_key)


def _load_trace_from_disk(usage_path: Path) -> dict | None:
    """Load trace from usage.json. Returns trace dict for print_summary, or None if not found/invalid."""
    if not usage_path.exists():
        return None
    try:
        data = json.loads(usage_path.read_text(encoding="utf-8"))
        trace = UsageTrace.model_validate(data)
        return trace.to_trace_dict()
    except Exception:
        return None


def print_summary(usage_path: Path | None = None) -> None:
    """Print a human-readable usage summary. Reads from usage.json (source of truth).
    Call flush_traces_for_key or flush_traces_to_disk before this to persist in-memory usage.
    """
    if usage_path is None:
        key = get_context()
        if key:
            config_hash, cache_key = key
            usage_path = video_cache_path(cache_key, config_hash, "usage.json")
        else:
            usage_path = None
    if not usage_path:
        return
    trace = _load_trace_from_disk(usage_path)
    if not trace:
        return
    llm = trace["totals"]["llm"]
    images = trace["totals"]["images"]
    voice = trace["totals"]["voice"]
    if llm["calls"] == 0 and images["images"] == 0 and voice["calls"] == 0:
        return

    est = compute_cost_estimate(trace)
    lines = [
        "",
        "📊 Usage (this run)",
        "─" * 40,
    ]

    if llm["calls"]:
        lines.append("  OpenAI/Anthropic Text (LLM)")
        for u in trace["llm"]:
            usd, pi, po = _llm_entry_cost(u)
            cost_suffix = ""
            if pi is not None and po is not None:
                cost_suffix = f" @ ${pi:.2f}/${po:.2f} per 1M → ${usd:.4f}"
            lines.append(
                f"    {u.step}: {u.total_tokens} tokens "
                f"(prompt {u.prompt_tokens}, completion {u.completion_tokens}) — {u.model}{cost_suffix}"
            )
        lines.append(
            f"    Total: {llm['total_tokens']} tokens ({llm['calls']} call(s)) → ${est['llm_usd']:.4f}"
        )
        lines.append("")

    if images["images"]:
        lines.append("  OpenAI Image Gen")
        by_step: dict[str, list] = {}
        for u in trace["images"]:
            by_step.setdefault(u.step, []).append(u)
        for step, us in by_step.items():
            total_count = sum(x.count for x in us)
            model = us[0].model if us else "?"
            step_usd = sum(_image_entry_cost(x)[0] for x in us)
            price = _image_entry_cost(us[0])[1] if us else None
            cost_suffix = ""
            if price is not None:
                cost_suffix = f" @ ${price:.3f}/image → ${step_usd:.4f}"
            lines.append(f"    {step}: {total_count} image(s) — {model}{cost_suffix}")
        lines.append(f"    Total: {images['images']} image(s) → ${est['images_usd']:.4f}")
        lines.append("")

    if voice["calls"]:
        lines.append("  ElevenLabs Voice Gen")
        for u in trace["voice"]:
            usd, price = _voice_entry_cost(u)
            cost_suffix = ""
            if price is not None:
                cost_suffix = f" @ ${price:.2f}/1K → ${usd:.4f}"
            lines.append(f"    {u.step}: {u.characters} chars — {u.model_id}{cost_suffix}")
        lines.append(
            f"    Total: {voice['characters']} characters ({voice['calls']} call(s)) → ${est['voice_usd']:.4f}"
        )

    lines.append("")
    lines.append(
        f"  Total est. cost: ${est['total_usd']:.4f} "
        f"(LLM ${est['llm_usd']:.4f} + images ${est['images_usd']:.4f} + voice ${est['voice_usd']:.4f})"
    )

    print("\n".join(lines), flush=True)


def _get_estimate_for_key(
    config_hash: str,
    cache_key: str,
) -> tuple[float, float, float, float]:
    """Get cost estimate for a key. Reads from usage.json on disk (source of truth)."""
    usage_path = video_cache_path(cache_key, config_hash, "usage.json")
    if usage_path.exists():
        try:
            data = json.loads(usage_path.read_text(encoding="utf-8"))
            est = data.get("estimate", {})
            return (
                est.get("llm_usd", 0),
                est.get("images_usd", 0),
                est.get("voice_usd", 0),
                est.get("total_usd", 0),
            )
        except Exception:
            pass
    return (0.0, 0.0, 0.0, 0.0)


def print_batch_summary(
    nuggets: list,
    configs: list,
) -> None:
    """Print comprehensive cost breakdown for a batch run. Reads from usage.json when available (matches usage trace)."""
    # Build rows from (nugget, config) pairs using usage.json (preferred) or _usage
    rows: list[tuple[str, str, str, float, float, float, float]] = []
    breakdown_rows: list[tuple[str, float, float, float, float]] = []

    for n in nuggets:
        cache_key = getattr(n, "cache_key", None) or (n.get("cache_key") if isinstance(n, dict) else None)
        if not cache_key:
            continue
        title = getattr(n, "title", None) or n.get("title", "?")
        for c in configs:
            config_hash = c.hash
            llm_u, img_u, voice_u, total_u = _get_estimate_for_key(config_hash, cache_key)
            if total_u == 0 and llm_u == 0 and img_u == 0 and voice_u == 0:
                continue
            config_name = c.name
            ck_display = cache_key[:12] + "…" if len(cache_key) > 12 else cache_key
            rows.append((config_name, ck_display, str(title)[:30], llm_u, img_u, voice_u, total_u))

    # Add unattributed and breakdown from _usage (not in usage.json)
    with _lock:
        keys = list(_usage.keys())
    for key in keys:
        config_hash, cache_key = key
        if config_hash == "_default" and cache_key == "_default":
            trace = get_trace(key)
            est = compute_cost_estimate(trace)
            llm_u, img_u, voice_u, total_u = est["llm_usd"], est["images_usd"], est["voice_usd"], est["total_usd"]
            if llm_u > 0 or img_u > 0 or voice_u > 0 or total_u > 0:
                rows.append(("(unattributed)", "-", "-", llm_u, img_u, voice_u, total_u))
        elif config_hash == "_breakdown":
            trace = get_trace(key)
            est = compute_cost_estimate(trace)
            breakdown_rows.append((cache_key, est["llm_usd"], est["images_usd"], est["voice_usd"], est["total_usd"]))

    if not rows and not breakdown_rows:
        return

    lines = ["", "Cost breakdown (batch run)", "─" * 70]
    header = f"{'Config':<12} {'Cache Key':<14} {'Title':<32} {'LLM':>8} {'Images':>8} {'Voice':>8} {'Total':>8}"
    lines.append(header)

    for config_name, ck, title, llm_u, img_u, voice_u, total_u in rows:
        lines.append(f"{config_name:<12} {ck:<14} {title:<32} ${llm_u:>6.4f} ${img_u:>6.4f} ${voice_u:>6.4f} ${total_u:>6.4f}")

    for _, llm_u, img_u, voice_u, total_u in breakdown_rows:
        lines.append(f"{'Breakdown':<12} {'(shared)':<14} {'':<32} ${llm_u:>6.4f} {'-':>8} {'-':>8} ${total_u:>6.4f}")

    lines.append("─" * 70)
    total_llm = sum(r[3] for r in rows) + sum(b[1] for b in breakdown_rows)
    total_img = sum(r[4] for r in rows)
    total_voice = sum(r[5] for r in rows)
    total_all = sum(r[6] for r in rows) + sum(b[4] for b in breakdown_rows)
    lines.append(f"{'Total':<12} {'':<14} {'':<32} ${total_llm:>6.4f} ${total_img:>6.4f} ${total_voice:>6.4f} ${total_all:>6.4f}")
    print("\n".join(lines), flush=True)
