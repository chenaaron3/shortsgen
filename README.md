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
│   ├── web/                   # Next.js app (runs, videos, WebSocket progress)
│   └── eval-ui/               # Vite + React eval UI
├── services/
│   └── python-generator/      # Python pipeline (Lambda containers)
│       ├── scripts/           # pipeline/, handlers/, upload/, eval/, judge/, schemas/
│       ├── configs/           # YAML configs
│       ├── prompts/           # LLM system prompts
│       ├── assets/            # Mascot reference
│       └── cache/             # Config-scoped cache
├── packages/
│   ├── types/                 # Shared schemas: manifest, api, table, progress-event-type
│   └── db/                    # Drizzle schema (Auth.js + runs/videos); drizzle-zod → types
├── functions/                 # Node Lambda triggers (invoke Python handlers)
├── public/                    # Shared Remotion assets (Python writes, Remotion reads)
│   └── shortgen/
├── sst.config.ts              # SST v3: API, WebSocket, Python Lambdas
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
| **manifest.json**     | `public/shortgen/{configHash}_{cacheKey}/` | Remotion: composite cacheKey, scenes, captions. Schema: `packages/types` (Zod → JSON Schema → Pydantic). |
| **index.json**        | `public/shortgen/`                         | List of composite keys; Root.tsx uses it to register compositions.                                       |
| **breakdown.json**    | `cache/_breakdown/{sourceHash}/`           | Shared nuggets; per-config: `cache/{configName}/breakdowns/{sourceHash}/` (videos.md, upload_state.json) |
| **upload_state.json** | Same dir as breakdown.json                 | Per-cache_key YouTube upload state; used by `upload_youtube --breakdown-hash -c config`.                 |

**Caption format:** `{ "text", "startMs", "endMs", "timestampMs", "confidence" }` (word-level from Whisper or scene-level fallback).

### Types (shared TypeScript + Python)

Schemas are consolidated in `packages/types` (manifest, api, table, progress-event-type). Table schemas (runs, videos) come from `packages/db` via drizzle-zod. Flow:

1. **Zod** (source in `packages/types/src/`) → JSON Schema via `pnpm types:build`
2. **JSON Schema** → Pydantic (`scripts/schemas/*.py`) via `pnpm types:sync`

`types:sync` generates: `video_manifest.py`, `api_models.py`, `table_models.py`, `progress_event_type.py`. After editing `packages/types/src/` or `packages/db/schema.ts`, run `pnpm types:sync`. See `.cursor/rules/manifest-schema-sync.mdc`.

---

## Setup

```bash
# Install deps (pnpm monorepo)
pnpm install

# Pipeline (Python); run from project root
# Option A: pip
pip install -r services/python-generator/requirements.txt
# Option B: uv (pyproject.toml)
cd services/python-generator && uv sync
```

**Environment (`.env` in project root):**

- `OPENAI_API_KEY` — Script, chunker, images (when using gpt backend).
- `ANTHROPIC_API_KEY` — Required when config uses Claude models (e.g. claude-sonnet).
- `ELEVENLABS_API_KEY` (or `XI_API_KEY`) — TTS. Optional: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_CONCURRENCY`, `ELEVENLABS_STABILITY`, etc.
- `REPLICATE_API_TOKEN` — If using Replicate for images (`image_generator/__init__.py`: `IMAGE_GENERATOR = "replicate"`). For OpenAI images use `IMAGE_GENERATOR = "gpt"`.
- YouTube upload (optional): Google OAuth + API client; see `upload_youtube.py` for scopes and usage.

---

## Manual setup (SST deployment)

For deploying the web app + Python Lambdas to AWS:

### 1. Create `.env` at project root

Add your API keys (used for local pipeline and for copying into SST secrets):

```
OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
ELEVENLABS_API_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Set SST secrets (required before deploy)

Replace `<stage>` with your stage (e.g. `aaron`). `ShortgenApiSecret` must match `SHORTGEN_API_SECRET` in `apps/web/.env`.

```bash
# Option A: Set each secret manually
pnpm sst secret set ShortgenApiSecret <value> --stage <stage>
pnpm sst secret set ShortgenOpenaiApiKey <value> --stage <stage>
pnpm sst secret set ShortgenReplicateApiToken <value> --stage <stage>
pnpm sst secret set ShortgenElevenlabsApiKey <value> --stage <stage>
pnpm sst secret set ShortgenAnthropicApiKey <value> --stage <stage>

# Option B: Set from .env (run from project root)
source .env
pnpm sst secret set ShortgenApiSecret "$SHORTGEN_API_SECRET" --stage <stage>
pnpm sst secret set ShortgenOpenaiApiKey "$OPENAI_API_KEY" --stage <stage>
pnpm sst secret set ShortgenReplicateApiToken "$REPLICATE_API_TOKEN" --stage <stage>
pnpm sst secret set ShortgenElevenlabsApiKey "$ELEVENLABS_API_KEY" --stage <stage>
pnpm sst secret set ShortgenAnthropicApiKey "$ANTHROPIC_API_KEY" --stage <stage>
```

### 3. Deploy

```bash
pnpm sst deploy --stage <stage>
```

### 4. Configure web app

After deploy, set `apps/web/.env` with the API URL, WebSocket URL, bucket name, and the same `SHORTGEN_API_SECRET` used in step 2.

---

## Commands

Run from **project root**.

```bash
# Remotion Studio
pnpm dev

# Web app (Next.js)
pnpm web

# Eval UI
pnpm eval:ui

# Types sync (after editing packages/types/src/)
pnpm types:build     # Zod → JSON Schema
pnpm types:sync      # JSON Schema → Pydantic (scripts/schemas/*.py)

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

## Web app flow (apps/web)

Create page: user pastes source text → creates Run in DB → triggers `initial-processing` Lambda → Python breakdown + pipeline per nugget → WebSocket progress → user reviews clips, adds feedback → `update-feedback` → user finalizes clip → `finalize-clip` Lambda → Remotion render → S3 → `VIDEO_READY` over WebSocket.

**API routes:** `POST /runs/initial-processing`, `POST /runs/update-feedback`, `POST /runs/finalize-clip`. Node Lambdas in `functions/` invoke Python handlers in `scripts/handlers/`. These endpoints are protected by a shared secret; only the tRPC server (Next.js) can call them.

---

## Admin run logs

Admins can view CloudWatch logs for a run (and optionally a specific video) from the run page via the "View logs" button.

### Log context (runId, videoId)

The Python logger (`services/python-generator/scripts/logger.py`) prefixes every log line with `[runId=xxx]` and, when applicable, `[videoId=yyy]` so CloudWatch can filter by run or video.

- **runId:** Set at the start of each Lambda handler (initial_processing, update_feedback, finalize_clip). All pipeline logs include it.
- **videoId:** Set when processing a specific video:
  - **initial_processing:** Per-clip work (script, chunker) runs in a thread pool; each worker sets video context via `set_video_context(video_id)` so that clip’s logs include videoId.
  - **update_feedback, finalize_clip:** Set at handler start (single video per invocation).

Run-level steps (e.g. breakdown) have runId only. Video-level steps have both.

### Querying from the client

The admin tRPC endpoint `admin.getRunLogs({ runId, videoId? })`:

1. Fetches the run from DB to get `created_at` for the time window.
2. Discovers Shortgen log groups via `DescribeLogGroups` (prefix `/aws/lambda`, name contains `Shortgen`).
3. Runs a CloudWatch Logs Insights query:
   - With **videoId:** `filter @message like /runId/ or @message like /videoId/` — run-level logs plus that video’s logs.
   - Without **videoId:** `filter @message like /runId/` — all run logs.
4. Polls `GetQueryResults` until the query completes (CloudWatch queries are async).
5. Returns `{ logs: [{ timestamp, logStream, message }], error? }`.

The run page passes the currently selected video to the modal; with no video selected, it queries run-level logs only.

### Admin setup

- **ADMIN_EMAILS** (apps/web/.env): Comma-separated emails allowed to see the View logs button and call `getRunLogs`.
- **AWS credentials** (apps/web/.env): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (default `us-east-1`). IAM needs `logs:DescribeLogGroups`, `logs:StartQuery`, `logs:GetQueryResults`.

---

## SST deploy

**Before deploying:** Ensure sufficient disk space (~20GB+ free). If deploy fails with `failed to extract tar.gz file: exit status 1`, free Docker space:

```bash
docker system prune -af --volumes
```

**AWS credentials:** If using `aws login` with session tokens, unset expired tokens before deploy so the CLI falls back to long-term credentials:

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION
pnpm exec sst deploy
```

**After deploy:** Configure `apps/web/.env` with SST outputs so the web app can invoke the API and WebSocket:

```
SHORTGEN_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_SHORTGEN_WS_URL=wss://<ws-api-id>.execute-api.us-east-1.amazonaws.com/$default
SHORTGEN_BUCKET_NAME=<bucket-name>
SHORTGEN_API_SECRET=<same-value-as-sst-secret>
```

**Secrets:** `ShortgenDatabaseUrl` (Postgres for runs/videos and Auth.js). `ShortgenApiSecret` (shared secret for API Gateway; set via `pnpm sst secret set ShortgenApiSecret <value>` and use the same value in `apps/web/.env` as `SHORTGEN_API_SECRET`).

---

## Conventions (for contributors and AI)

- **Types:** Edit Zod in `packages/types/src/`; run `pnpm types:sync` so TypeScript and Python stay in sync. Do not hand-edit `packages/types/generated/` or `scripts/schemas/*.py`.
- **Paths:** Use `path_utils` only; no hardcoded paths. Key: `video_cache_path(cache_key, config_hash, ...)`, `breakdown_cache_path(source_hash, config_hash)`, `remotion_composite_key()`, `video_public()`, `project_root()`, `prompts_dir()`, `env_path()`.
- **Logging:** Use `logger` (step_start, step_end, cache_hit, cache_miss, progress, info, warn, error) in pipeline scripts; see `.cursor/rules/logger.mdc`. Handlers set `set_run_context(run_id)` and `set_video_context(video_id)` so CloudWatch can filter by run/video (see [Admin run logs](#admin-run-logs)).
- **Scripts:** Run via `pnpm pipeline -- <script>` or `python services/python-generator/scripts/run.py <script>`; `run.py` sets `PYTHONPATH` to `scripts/`. `path_utils` resolves monorepo root.
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
