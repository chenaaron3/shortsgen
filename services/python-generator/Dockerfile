# shortgen generation pipeline (Python-only, Fargate)
# Steps 1-4: script → chunker → images+voice → prepare (with captions). Stops before Remotion render.
FROM python:3.12-slim

# Runtime deps (ffmpeg for pydub/audio)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY services/python-generator/requirements.txt generation/requirements.txt
RUN pip install --no-cache-dir -r generation/requirements.txt

# Copy generation pipeline to /app/generation (path_utils expects this structure)
COPY services/python-generator/ generation/
RUN mkdir -p public/shortgen && chmod +x /app/generation/scripts/entrypoint.sh

ENTRYPOINT ["/app/generation/scripts/entrypoint.sh"]
