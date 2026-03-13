#!/usr/bin/env bash
set -euo pipefail

# shortgen generation pipeline entrypoint.
# Run with args, e.g.: -f /path/to/source.txt -c default --no-breakdown --break prepare
# S3 download/upload will be handled in the pipeline later.
exec python generation/scripts/run.py pipeline/run_source_pipeline.py "$@"
