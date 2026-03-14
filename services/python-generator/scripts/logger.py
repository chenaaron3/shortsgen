"""Consolidated logging for the shortgen pipeline.

Provides step headers, progress reporting, cache hit/miss stats,
output file reporting, and clear step boundaries.
Thread-safe for concurrent execution (images + voice).
"""

import contextvars
from contextlib import contextmanager
import sys
import threading
from pathlib import Path

_lock = threading.Lock()
_step_context: tuple[int, int] | None = None  # (num, total) when in pipeline
_run_context: str | None = None  # runId for CloudWatch filtering
_video_context_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("video_id", default=None)


def set_run_context(run_id: str) -> None:
    """Set runId context so all logs include it for CloudWatch filtering."""
    global _run_context
    _run_context = run_id


def clear_run_context() -> None:
    """Clear runId context."""
    global _run_context
    _run_context = None


def set_video_context(video_id: str) -> None:
    """Set videoId context so video-specific logs include it for CloudWatch filtering."""
    _video_context_var.set(video_id)


def clear_video_context() -> None:
    """Clear videoId context."""
    _video_context_var.set(None)


@contextmanager
def run_context(run_id: str):
    """Context manager: set run context on enter, clear on exit."""
    set_run_context(run_id)
    try:
        yield
    finally:
        clear_run_context()


@contextmanager
def run_video_context(run_id: str, video_id: str):
    """Context manager: set run + video context on enter, clear both on exit."""
    set_run_context(run_id)
    set_video_context(video_id)
    try:
        yield
    finally:
        clear_video_context()
        clear_run_context()


@contextmanager
def video_context(video_id: str):
    """Context manager: set video context on enter, clear on exit."""
    set_video_context(video_id)
    try:
        yield
    finally:
        clear_video_context()


def _prefix() -> str:
    """Return [runId=xxx] [videoId=xxx] prefix when run/video context is set."""
    parts: list[str] = []
    if _run_context:
        parts.append(f"[runId={_run_context}]")
    if _video_context_var.get():
        parts.append(f"[videoId={_video_context_var.get()}]")
    return " ".join(parts) + " " if parts else ""


def set_step_context(num: int, total: int) -> None:
    """Set pipeline step context for step_start (e.g. Step 1/5)."""
    global _step_context
    _step_context = (num, total)


def clear_step_context() -> None:
    """Clear pipeline step context."""
    global _step_context
    _step_context = None


_STEP_EMOJIS = {
    "Breakdown": "📚",
    "Script": "📝",
    "Chunks": "✂️",
    "Images": "🖼️",
    "Voice": "🔊",
    "Prepare Remotion assets": "📦",
    "Render video": "🎬",
}


def _step_header() -> str:
    if _step_context is not None:
        n, t = _step_context
        return f"Step {n}/{t}"
    return ""


def step_start(name: str, *, num: int | None = None, total: int | None = None) -> None:
    """Print step header. Uses set_step_context if num/total not provided."""
    prefix = _step_header() if (num is None and total is None) else ""
    if num is not None and total is not None:
        prefix = f"Step {num}/{total}"
    emoji = _STEP_EMOJIS.get(name, "▶")
    label = f" {prefix} " if prefix else " "
    with _lock:
        p = _prefix()
        print("", flush=True, file=sys.stdout)
        print(f"{p}{emoji} {label}{name}", flush=True, file=sys.stdout)
        print(f"{p}{'─' * 50}", flush=True, file=sys.stdout)


def step_end(
    name: str,
    *,
    outputs: list[Path | str] = (),
    cache_hits: int = 0,
    cache_misses: int = 0,
    duration_sec: float | None = None,
) -> None:
    """Print step footer with cache stats and output paths."""
    emoji = _STEP_EMOJIS.get(name, "✓")
    parts = [f"{emoji} {name} done"]
    if cache_hits or cache_misses:
        parts.append(f"{cache_hits} hit, {cache_misses} miss")
    if duration_sec is not None:
        parts.append(f"{duration_sec:.1f}s")
    summary = " · " + " · ".join(parts[1:]) if len(parts) > 1 else ""
    with _lock:
        p = _prefix()
        print(f"{p}  {parts[0]}{summary}", flush=True, file=sys.stdout)
        for out in outputs:
            path_str = str(Path(out)) if out else ""
            print(f"{p}    → {path_str}", flush=True, file=sys.stdout)
        print("", flush=True, file=sys.stdout)


def cache_hit(path: Path | str) -> None:
    """Log a cache hit."""
    with _lock:
        print(f"{_prefix()}  ✓ cache hit: {path}", flush=True, file=sys.stdout)


def cache_miss(path: Path | str | None = None) -> None:
    """Log a cache miss (optional path or reason)."""
    msg = str(path) if path else "cache miss"
    with _lock:
        print(f"{_prefix()}  ○ cache miss: {msg}", flush=True, file=sys.stdout)


def progress(current: int, total: int, message: str = "") -> None:
    """Thread-safe progress line, e.g. '  [3/10] saved -> file.png'."""
    prefix = f"  [{current}/{total}]"
    line = f"{prefix} {message}" if message else prefix
    with _lock:
        print(f"{_prefix()}{line}", flush=True, file=sys.stdout)


def output(path: Path | str, label: str = "") -> None:
    """Log an output file or directory."""
    path_str = str(Path(path)) if path else ""
    line = f"  output: {path_str}" + (f" ({label})" if label else "")
    with _lock:
        print(f"{_prefix()}{line}", flush=True, file=sys.stdout)


def info(msg: str) -> None:
    """Log an info message."""
    with _lock:
        print(f"{_prefix()}{msg}", flush=True, file=sys.stdout)


def warn(msg: str) -> None:
    """Log a warning to stderr."""
    with _lock:
        print(f"{_prefix()}{msg}", flush=True, file=sys.stderr)


def error(msg: str) -> None:
    """Log an error to stderr."""
    with _lock:
        print(f"{_prefix()}{msg}", flush=True, file=sys.stderr)


def cache_stats_summary(
    cache_hits: int, cache_misses: int, to_generate: int, extra: str = ""
) -> None:
    """Log a one-line cache summary for steps with multiple items (images, voice)."""
    parts = [f"✓ {cache_hits} hit", f"○ {cache_misses} miss"]
    if to_generate:
        parts.append(f"generating {to_generate}")
    if extra:
        parts.append(extra)
    with _lock:
        print(f"{_prefix()}  {' · '.join(parts)}", flush=True, file=sys.stdout)
