# shortgen

Remotion-based short video generator for faceless shorts. Turns raw content (or book/podcast sources) into vertical shorts with AI-generated script, scene images, TTS voice, and word-level captions.

**Stack:** Python pipeline (script → chunker → images + voice → prepare → render) + Remotion (React) for composition and rendering. Cache-keyed by content hash; supports source breakdown into multiple nuggets (one video per nugget).

---

## Project structure

```
shortgen/
├── src/                          # Remotion compositions
│   ├── Root.tsx                  # Fetches index.json, registers ShortVideoComposition per cacheKey
│   ├── ShortVideo.tsx            # Main composition: manifest-driven Series + CaptionsOverlay
│   ├── SceneSlide.tsx            # One scene: image + voice, fade in/out
│   ├── CaptionsOverlay.tsx       # TikTok-style word captions (@remotion/captions)
│   └── types.ts                 # VideoManifest, SceneInput, Caption
├── public/                       # Static assets for Remotion
│   └── shortgen/{cacheKey}/      # Per-content (written by prepare step)
│       ├── manifest.json         # Scenes, captions, dimensions, durationInFrames
│       ├── images/               # image_1.png, ...
│       └── voice/               # voice_1.mp3, ...
├── generation/                   # Python pipeline
│   ├── scripts/                 # Run from project root (e.g. python generation/scripts/pipeline/run_pipeline.py)
│   │   ├── pipeline/            # Content generation: script → chunker → images+voice → prepare → render
│   │   │   ├── run_pipeline.py       # Single content: full pipeline
│   │   │   ├── run_source_pipeline.py # Source file → breakdown → one pipeline run per nugget
│   │   │   ├── breakdown_source.py   # LLM: source → nuggets → breakdown.json
│   │   │   ├── generate_script.py    # Step 1: LLM → script.md
│   │   │   ├── run_chunker.py       # Step 2: LLM (structured) → chunks.json
│   │   │   ├── generate_images.py   # Step 3: image_generator → images/
│   │   │   ├── generate_voice.py     # Step 3: ElevenLabs TTS → voice/
│   │   │   ├── prepare_remotion_assets.py # Step 4: copy to public/, Whisper captions → manifest.json
│   │   │   └── render_video.py      # Step 5: npx remotion render ShortVideo
│   │   ├── upload/              # Distribution
│   │   │   └── upload_youtube.py    # Upload short.mp4 to YouTube (Data API v3)
│   │   ├── eval/                # Error analysis
│   │   │   └── build_eval_dataset.py # Breakdowns → eval-ui/public/eval-dataset.json
│   │   ├── path_utils.py        # cache_path, video_public, project_root, etc.
│   │   ├── models.py            # Pydantic: Scene, Chunks, Nugget, BreakdownOutput, ...
│   │   ├── logger.py            # step_start/end, cache_hit/miss, progress
│   │   └── image_generator/     # Backend: gpt (OpenAI) or replicate (IMAGE_GENERATOR)
│   ├── prompts/                 # LLM system prompts
│   ├── assets/                  # Mascot reference (mascot_glasses.png)
│   ├── cache/                   # Per-content and per-source cache
│   │   ├── _breakdowns/{sourceHash}/  # breakdown.json, videos.md
│   │   └── {cacheKey}/          # script.md, chunks.json, images/, voice/, captions/
│   └── requirements.txt
├── remotion.config.ts
└── package.json
```

---

## Pipeline flow

### Single content (run_pipeline)

1. **Script** — Raw text → GPT-4o → `cache/{cacheKey}/script.md` (short script ~40–60s).
2. **Chunker** — script.md → GPT-4o (structured) → `chunks.json` (scenes: text, imagery, section; image_path/voice_path filled later).
3. **Images + Voice** — Run in parallel: image generator (OpenAI or Replicate) + ElevenLabs TTS → `images/`, `voice/`; chunks.json updated with paths.
4. **Prepare** — Copy assets to `public/shortgen/{cacheKey}/`, run faster-whisper (word-level) → `manifest.json`, update `index.json`.
5. **Render** — `npx remotion render ShortVideo --props '{"cacheKey":"..."}'` → `cache/{cacheKey}/short.mp4`.

**Cache key:** First 16 chars of `SHA256(raw_content)`. For hash mode (resume from cached script): `-H CACHE_KEY` runs from chunker onward.

### Source breakdown (run_source_pipeline)

- Input: one source file (e.g. book, transcript).
- **Breakdown** — LLM → `cache/_breakdowns/{sourceHash}/breakdown.json` (nuggets: id, title, summary, source_ref, **cache_key**). Each nugget’s `cache_key` = first 16 chars of `SHA256(summary)`.
- Then run the full pipeline once per nugget (summary = raw_content). Writes `videos.md` next to breakdown with links to `short.mp4`.

---

## Data structures

| Artifact | Location | Purpose |
|----------|----------|---------|
| **chunks.json** | `cache/{cacheKey}/` | Pipeline: scenes with text, imagery, section, image_path, voice_path; title, description. |
| **manifest.json** | `public/shortgen/{cacheKey}/` | Remotion: cacheKey, fps, width, height, durationInFrames, scenes (imagePath, voicePath, durationInSeconds), captions (text, startMs, endMs, timestampMs). |
| **index.json** | `public/shortgen/` | List of cacheKeys with manifests; Root.tsx uses it to register compositions. |
| **breakdown.json** | `cache/_breakdowns/{sourceHash}/` | Nuggets with cache_key linking to per-nugget cache. |
| **upload_state.json** | `cache/_breakdowns/{sourceHash}/` | Per-cache_key YouTube upload state (scheduled_at, video_id); used by `upload_youtube --breakdown-hash` to skip already-scheduled videos. |

**Caption format:** `{ "text", "startMs", "endMs", "timestampMs", "confidence" }` (word-level from Whisper or scene-level fallback).

---

## Setup

```bash
# Remotion (Node)
npm install

# Pipeline (Python); run from project root
pip install -r generation/requirements.txt
```

**Environment (`.env` in project root):**

- `OPENAI_API_KEY` — Script, chunker, and (if using gpt image backend) images.
- `ELEVENLABS_API_KEY` (or `XI_API_KEY`) — TTS. Optional: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_CONCURRENCY`, `ELEVENLABS_STABILITY`, etc.
- `REPLICATE_API_TOKEN` — If using Replicate for images (`image_generator/__init__.py`: `IMAGE_GENERATOR = "replicate"`). For OpenAI images use `IMAGE_GENERATOR = "gpt"`.
- YouTube upload (optional): Google OAuth + API client; see `upload_youtube.py` for scopes and usage.

---

## Commands

Run Python scripts from **project root**. Use `generation/scripts/run.py` as a launcher (sets PYTHONPATH), or export `PYTHONPATH=generation/scripts` first.

```bash
# Option: set PYTHONPATH once, then run scripts directly
export PYTHONPATH=generation/scripts  # or: . generation/scripts/.envrc if using direnv
python generation/scripts/pipeline/run_pipeline.py -f content.txt

# Option: use the run launcher (no export needed)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt
```

```bash
# Single content — full pipeline (use run.py or set PYTHONPATH first)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt

# Single content — run up to a step (invalidates that step and later)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --step script
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --step chunker
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --step image
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --step prepare
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --step video

# Limit scenes (testing)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt --max-scenes 3

# Resume from cache (no raw content; starts at chunker)
python generation/scripts/run.py pipeline/run_pipeline.py -H 8d9dea719895c33a

# Source → many videos
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt --max-nuggets 5 --max-scenes 4
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt --breakdown-only

# Prepare only (after images+voice exist)
python generation/scripts/run.py pipeline/prepare_remotion_assets.py CACHE_KEY

# Remotion Studio (pick composition by cacheKey in UI or set props)
npx remotion studio

# Render (or use render_video.py which runs this)
npx remotion render ShortVideo --props '{"cacheKey":"8d9dea719895c33a"}' --codec h264 --output out/short.mp4

# Upload to YouTube (optional)
python generation/scripts/run.py upload/upload_youtube.py --cache-key 8d9dea719895c33a
python generation/scripts/run.py upload/upload_youtube.py --breakdown-hash SOURCE_HASH
```

---

## Conventions (for contributors and AI)

- **Paths:** Use `path_utils` only; no hardcoded paths. Key: `cache_path(cache_key, ...)`, `video_public()`, `project_root()`, `breakdown_cache_path(source_hash)`, `mascot_path()`, `prompts_dir()`, `env_path()`.
- **Logging:** Use `logger` (step_start, step_end, cache_hit, cache_miss, progress, info, warn, error) in pipeline scripts; see `.cursor/rules/logger.mdc`.
- **Scripts:** Intended to be run from `generation/scripts/` (or project root with `generation/scripts/` on path); `path_utils` is relative to project root.
- **Remotion:** Composition id for rendering is `ShortVideo`; it receives `cacheKey` in props and loads `public/shortgen/{cacheKey}/manifest.json` in `calculateMetadata`. Root registers one composition per entry in `index.json` for Studio.

---

## APIs and backends

| Step | Service | Notes |
|------|---------|--------|
| Script | OpenAI GPT-4o | `short-script-system-prompt.md` |
| Chunker | OpenAI GPT-4o (structured) | `transcript-chunker-system-prompt.md`, ChunksOutput |
| Breakdown | OpenAI GPT-4o (structured) | `source-breakdown-system-prompt.md`, BreakdownOutput |
| Images | OpenAI (gpt) or Replicate | `image_generator`: IMAGE_GENERATOR, mascot ref, stick-figure style |
| Voice | ElevenLabs | eleven_v3, voice Adam (or env); mp3_44100_128 |
| Captions | faster-whisper | Word-level; fallback scene-level from chunk text |
| Upload | YouTube Data API v3 | OAuth; title/description from chunks.json |

---

## More context

- **Full structure and data shapes:** `.cursor/rules/project-structure.mdc` (always-applied rule).
- **Path and logger rules:** `.cursor/rules/path-utils.mdc`, `.cursor/rules/logger.mdc`.
