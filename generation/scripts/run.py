#!/usr/bin/env python3
"""
Run a script from generation/scripts with PYTHONPATH set.
Usage: python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt
       python generation/scripts/run.py eval/build_eval_dataset.py
"""
import os
import subprocess
import sys
from pathlib import Path

scripts_dir = Path(__file__).resolve().parent
env = os.environ.copy()
env["PYTHONPATH"] = str(scripts_dir) + os.pathsep + env.get("PYTHONPATH", "")

if len(sys.argv) < 2:
    print("Usage: python generation/scripts/run.py <script> [args...]", file=sys.stderr)
    print("  e.g. python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt", file=sys.stderr)
    sys.exit(1)

script_path = scripts_dir / sys.argv[1]
if not script_path.exists():
    print(f"Error: {script_path} not found", file=sys.stderr)
    sys.exit(1)

result = subprocess.run([sys.executable, str(script_path)] + sys.argv[2:], env=env)
sys.exit(result.returncode)
