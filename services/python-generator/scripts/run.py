#!/usr/bin/env python3
"""
Run a script from services/python-generator/scripts with PYTHONPATH set.

If services/python-generator/.venv exists, any ``python3 .../run.py`` invocation is
re-executed with that venv's interpreter so deps match ``pyproject.toml`` (e.g. ``uv sync`` or ``pip install -e services/python-generator``).

Usage (from repo root):
  python3 services/python-generator/scripts/run.py pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown
"""
import os
import subprocess
import sys
from pathlib import Path


def _reexec_with_service_venv() -> None:
    """Prefer python-generator/.venv when present so ``python3 run.py`` works without PATH tweaks."""
    here = Path(__file__).resolve()
    scripts_dir = here.parent
    venv_root = (scripts_dir.parent / ".venv").resolve()
    venv_bin = venv_root / "bin"
    try:
        already_in_venv = Path(sys.prefix).resolve() == venv_root
    except OSError:
        already_in_venv = False
    if already_in_venv:
        return
    for name in ("python3", "python"):
        candidate = venv_bin / name
        if not candidate.is_file():
            continue
        os.execv(str(candidate), [str(candidate), str(here), *sys.argv[1:]])


_reexec_with_service_venv()

scripts_dir = Path(__file__).resolve().parent
env = os.environ.copy()
env["PYTHONPATH"] = str(scripts_dir) + os.pathsep + env.get("PYTHONPATH", "")

if len(sys.argv) < 2:
    print("Usage: python generation/scripts/run.py <script> [args...]", file=sys.stderr)
    print("  e.g. python generation/scripts/run.py pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown", file=sys.stderr)
    sys.exit(1)

script_path = scripts_dir / sys.argv[1]
if not script_path.exists():
    print(f"Error: {script_path} not found", file=sys.stderr)
    sys.exit(1)

result = subprocess.run([sys.executable, str(script_path)] + sys.argv[2:], env=env)
sys.exit(result.returncode)
