# shortgen

Remotion-based short video generator for faceless shorts. Turns raw content (or book/podcast sources) into vertical shorts with AI-generated script, scene images, TTS voice, and word-level captions.

**Stack:** Python pipeline (script → chunker → images + voice → prepare → render) + Remotion (React) for composition and rendering. Config-driven (model + prompt per step); cache scoped by config hash; supports source breakdown into multiple nuggets (one video per nugget). Run multiple configs for eval comparison.

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
│   │   ├── path_utils.py        # cache_path, video_public, project_root, etc.
│   │   ├── models.py            # Pydantic: Scene, Chunks, Nugget, BreakdownOutput, ...
│   │   ├── logger.py            # step_start/end, cache_hit/miss, progress
│   │   └── image_generator/     # Backend: gpt (OpenAI) or replicate (IMAGE_GENERATOR)
│   ├── configs/                 # Pipeline configs (model + system prompt per step)
│   ├── prompts/                 # LLM system prompts
│   ├── assets/                  # Mascot reference (mascot_glasses.png)
│   ├── cache/                   # Config-scoped cache
│   │   └── {configHash}/        # Per-config
│   │       ├── _breakdown/{sourceHash}/  # breakdown.json (shared)
│   │       └── videos/{cacheKey}/        # script.md, chunks.json, images/, voice/, captions/
│   └── requirements.txt
├── remotion.config.ts
└── package.json
```

---

## Pipeline flow

### Single content (run_pipeline)

Requires `-c config.yaml`. Config defines model and system prompt for each LLM step (breakdown, script, chunk).

1. **Script** — Raw text → LLM (from config) → `cache/{configHash}/videos/{cacheKey}/script.md`
2. **Chunker** — script.md → LLM (structured) → `chunks.json`
3. **Images + Voice** — Run in parallel; chunks.json updated with paths.
4. **Prepare** — Copy to `public/shortgen/{configHash}_{cacheKey}/`, Whisper captions → `manifest.json`
5. **Render** — `npx remotion render` → `cache/{configHash}/videos/{cacheKey}/short.mp4`

**Cache key:** First 16 chars of `SHA256(raw_content)`. Hash mode: `-H CACHE_KEY -c config.yaml` runs from chunker onward.

### Source breakdown (run_source_pipeline)

- Input: one source file; `-c config.yaml` or `-c config1.yaml config2.yaml` for multiple configs.
- **Breakdown** — LLM → `cache/_breakdown/{sourceHash}/breakdown.json` (shared across configs)
- Run pipeline once per nugget per config. Multiple configs enable eval comparison of script quality.

---

## Data structures

| Artifact              | Location                                   | Purpose                                                                                                  |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **chunks.json**       | `cache/{configHash}/videos/{cacheKey}/`    | Pipeline: scenes with text, imagery, section, image_path, voice_path.                                    |
| **manifest.json**     | `public/shortgen/{configHash}_{cacheKey}/` | Remotion: composite cacheKey, scenes, captions.                                                          |
| **index.json**        | `public/shortgen/`                         | List of composite keys; Root.tsx uses it to register compositions.                                       |
| **breakdown.json**    | `cache/_breakdown/{sourceHash}/`           | Shared nuggets; per-config: `cache/{configName}/breakdowns/{sourceHash}/` (videos.md, upload_state.json) |
| **upload_state.json** | Same dir as breakdown.json                 | Per-cache_key YouTube upload state; used by `upload_youtube --breakdown-hash -c config`.                 |

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

- `OPENAI_API_KEY` — Script, chunker, images (when using gpt backend).
- `ANTHROPIC_API_KEY` — Required when config uses Claude models (e.g. claude-sonnet).
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
# Config required: -c config.yaml (e.g. generation/configs/default.yaml or "default")
# Single content — full pipeline
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt -c configs/default.yaml

# Run up to a step (invalidates that step and later)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt -c default --step script

# Limit scenes (testing)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt -c default --max-scenes 3

# Resume from cache (starts at chunker)
python generation/scripts/run.py pipeline/run_pipeline.py -H 8d9dea719895c33a -c default

# Prototype mode: cheap text-to-image only (FLUX Schnell, no mascot, no transitions; requires IMAGE_GENERATOR=replicate)
python generation/scripts/run.py pipeline/run_pipeline.py -f content.txt -c default --prototype

# Source → many videos (one or more configs); writes eval-dataset.json for eval UI
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c default
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c claude-sonnet gpt4o --max-nuggets 5

# Script-only eval (no images/voice/video): --break script
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c default claude-sonnet --break script

# Remotion Studio (pick composition by composite cacheKey in UI)
npx remotion studio

# Upload to YouTube (requires -c)
python generation/scripts/run.py upload/upload_youtube.py --cache-key CACHE_KEY -c default
python generation/scripts/run.py upload/upload_youtube.py --breakdown-hash SOURCE_HASH -c default
```

---

## Conventions (for contributors and AI)

- **Paths:** Use `path_utils` only; no hardcoded paths. Key: `video_cache_path(cache_key, config_hash, ...)`, `breakdown_cache_path(source_hash, config_hash)`, `remotion_composite_key()`, `video_public()`, `project_root()`, `prompts_dir()`, `env_path()`.
- **Logging:** Use `logger` (step_start, step_end, cache_hit, cache_miss, progress, info, warn, error) in pipeline scripts; see `.cursor/rules/logger.mdc`.
- **Scripts:** Intended to be run from `generation/scripts/` (or project root with `generation/scripts/` on path); `path_utils` is relative to project root.
- **Remotion:** Composition id for rendering is `ShortVideo`; it receives `cacheKey` in props and loads `public/shortgen/{cacheKey}/manifest.json` in `calculateMetadata`. Root registers one composition per entry in `index.json` for Studio.

---

## APIs and backends

| Step      | Service                                | Notes                                                                                                                         |
| --------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Script    | Config: gpt-4o, Claude, etc. (LiteLLM) | Config defines model + `short-script-system-prompt.md`                                                                        |
| Chunker   | Config (LiteLLM)                       | Config defines model + `transcript-chunker-system-prompt.md`, ChunksOutput                                                    |
| Breakdown | Config (LiteLLM)                       | Config defines model + `source-breakdown-system-prompt.md`, BreakdownOutput                                                   |
| Images    | OpenAI (gpt) or Replicate              | `image_generator`: IMAGE_GENERATOR, mascot ref, stick-figure style; `--prototype` → Replicate FLUX Schnell text-to-image only |
| Voice     | ElevenLabs                             | eleven_v3 (single full-script call + word-level split); audio tags from chunker; mp3_44100_128                                |
| Captions  | faster-whisper                         | Word-level; fallback scene-level from chunk text                                                                              |
| Upload    | YouTube Data API v3                    | OAuth; title/description from chunks.json                                                                                     |

---

## More context

- **Full structure and data shapes:** `.cursor/rules/project-structure.mdc` (always-applied rule).
- **Path and logger rules:** `.cursor/rules/path-utils.mdc`, `.cursor/rules/logger.mdc`.
