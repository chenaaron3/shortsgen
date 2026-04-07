# syntax=docker/dockerfile:1
# Lambda-compatible Python image for pipeline handlers.
# SST uses this when building Python Functions with container: true.
# Static ffmpeg binary (no shared libs) - package managers don't have ffmpeg in Lambda/AL2023.
# Minimal Lambda image lacks tar; use alpine to extract, then copy static binaries.
FROM alpine:3.19 AS ffmpeg
ARG TARGETARCH=amd64
RUN apk add --no-cache curl xz && \
    curl -sL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${TARGETARCH}-static.tar.xz" -o /tmp/ffmpeg.tar.xz && \
    tar xf /tmp/ffmpeg.tar.xz -C /tmp && \
    mv /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe /usr/local/bin/

FROM public.ecr.aws/lambda/python:3.12
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffprobe /usr/local/bin/

# Install deps from pyproject.toml (single source of truth). Hatch needs scripts/ to build the wheel.
COPY pyproject.toml ${LAMBDA_TASK_ROOT}/generation/
COPY scripts ${LAMBDA_TASK_ROOT}/generation/scripts/
RUN pip install --no-cache-dir "${LAMBDA_TASK_ROOT}/generation/"

# Crawl4AI / Playwright browser for generic URL fallback in initial_processing.
RUN python -m playwright install chromium

# Pre-download faster-whisper models into image (avoids cold-start download in Lambda).
# Build cache mount speeds rebuilds; first build ~5–10 min. HF_TOKEN optional for rate limits.
RUN --mount=type=cache,target=/root/.cache/huggingface \
    HF_HOME=/root/.cache/huggingface python -c "\
from faster_whisper import WhisperModel; \
WhisperModel('base', device='cpu', compute_type='int8'); \
" && \
    mkdir -p ${LAMBDA_TASK_ROOT}/whisper-models && \
    cp -a /root/.cache/huggingface/hub ${LAMBDA_TASK_ROOT}/whisper-models/

# Copy pipeline code. SST artifact layout: shortgen_pipeline/scripts/handlers/...
# path_utils resolves from __file__; handlers.* imports need scripts/ on PYTHONPATH.
COPY . ${LAMBDA_TASK_ROOT}/generation/
# Support both direct build (scripts at generation/) and SST artifact (shortgen_pipeline/scripts)
ENV PYTHONPATH=${LAMBDA_TASK_ROOT}/generation/scripts:${LAMBDA_TASK_ROOT}/generation/shortgen_pipeline/scripts

# Default handler (override per Lambda via SST config)
CMD ["handlers.initial_processing.handler"]
