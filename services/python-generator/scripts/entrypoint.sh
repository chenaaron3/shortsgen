#!/usr/bin/env bash
set -euo pipefail

# Run-Video Task flow: RUN_ID set => run worker
if [[ -n "${RUN_ID:-}" ]]; then
  exec python generation/scripts/run_video/worker.py
fi

# Default: pipeline with args, e.g.: -f /path/to/source.txt -c default --no-breakdown --break prepare
exec python generation/scripts/run.py pipeline/run_source_pipeline.py "$@"
