# shortgen

Remotion-based short video generator for faceless shorts. Turns raw content (or book/podcast sources) into vertical shorts with AI-generated script, scene images, TTS voice, and word-level captions.

**Stack:** Python pipeline (script → chunker → images + voice → prepare → render) + Remotion (React) for composition and rendering. Config-driven (model + prompt per step); cache scoped by config hash; supports source breakdown into multiple nuggets (one video per nugget). Run multiple configs for eval comparison.

---

## Project structure

pnpm monorepo with SST v3. See [RESTRUCTURE.md](RESTRUCTURE.md) for the full folder map.

```
shortgen/
├── apps/
│   ├── remotion/              # Remotion compositions (src/, remotion.config.ts)
│   └── eval-ui/               # Vite + React eval UI
├── services/
│   └── python-generator/     # Python pipeline (Fargate)
│       ├── scripts/          # pipeline/, upload/, eval/, judge/, etc.
│       ├── configs/          # YAML configs
│       ├── prompts/          # LLM system prompts
│       ├── assets/           # Mascot reference
│       └── cache/            # Config-scoped cache
├── packages/
│   └── db/                   # Drizzle schema placeholder (wire up later)
├── public/                   # Shared Remotion assets (Python writes, Remotion reads)
│   └── shortgen/
├── sst.config.ts             # SST v3 infrastructure
└── package.json              # pnpm workspace root
```

---

## Pipeline flow

### Single content (run_source_pipeline --no-breakdown)

Requires `-c config.yaml`. Config defines model and system prompt for each LLM step (breakdown, script, chunk).

1. **Script** — Raw text → LLM (from config) → `cache/{configHash}/videos/{cacheKey}/script.md`
2. **Chunker** — script.md → LLM (structured) → `chunks.json`
3. **Images + Voice** — Run in parallel; chunks.json updated with paths.
4. **Prepare** — Copy to `public/shortgen/{configHash}_{cacheKey}/`, Whisper captions → `manifest.json`
5. **Render** — `npx remotion render` → `cache/{configHash}/videos/{cacheKey}/short.mp4`

**Cache key:** First 16 chars of `SHA256(raw_content)`.

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
# Install deps (pnpm monorepo)
pnpm install

# Pipeline (Python); run from project root
pip install -r services/python-generator/requirements.txt
```

**Environment (`.env` in project root):**

- `OPENAI_API_KEY` — Script, chunker, images (when using gpt backend).
- `ANTHROPIC_API_KEY` — Required when config uses Claude models (e.g. claude-sonnet).
- `ELEVENLABS_API_KEY` (or `XI_API_KEY`) — TTS. Optional: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_CONCURRENCY`, `ELEVENLABS_STABILITY`, etc.
- `REPLICATE_API_TOKEN` — If using Replicate for images (`image_generator/__init__.py`: `IMAGE_GENERATOR = "replicate"`). For OpenAI images use `IMAGE_GENERATOR = "gpt"`.
- YouTube upload (optional): Google OAuth + API client; see `upload_youtube.py` for scopes and usage.

---

## Commands

Run from **project root**.

```bash
# Remotion Studio
pnpm dev

# Eval UI
pnpm eval:ui

# Pipeline (use run.py launcher or pnpm pipeline)
python services/python-generator/scripts/run.py pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown
# or: pnpm pipeline -- pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown

# Config required: -c config (e.g. default)
# Single content — full pipeline (--no-breakdown = use entire file as one nugget)
python services/python-generator/scripts/run.py pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown

# Source breakdown (one or more configs); writes eval-dataset.json
python services/python-generator/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c default

# Remotion Studio (pick composition by composite cacheKey in UI)
pnpm dev

# SST
pnpm sst:dev
pnpm sst:deploy
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
