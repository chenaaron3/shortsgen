# shortgen — End-to-End Flow TODO

Steps to complete the full pipeline from raw content → rendered short → (optional) YouTube upload. Includes one-time manual setup.

---

## Manual setup (one-time)

### 1. Install dependencies

- [ ] **Node/pnpm:** `pnpm install` (from project root)
- [ ] **Python:** Create venv and install deps:
  ```bash
  cd services/python-generator
  python -m venv .venv
  source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
  pip install -r requirements.txt
  ```
- [ ] **Schema sync:** Run `pnpm schemas:py` so Python Pydantic models exist (uses `.venv/bin/datamodel-codegen`)

### 2. Environment variables

Create `.env` at project root with:

- [ ] `OPENAI_API_KEY` — required for script, chunker, images (when using gpt backend)
- [ ] `ANTHROPIC_API_KEY` — required if config uses Claude (e.g. `claude.yaml`)
- [ ] `ELEVENLABS_API_KEY` (or `XI_API_KEY`) — required for TTS
- [ ] `REPLICATE_API_TOKEN` — only if using Replicate for images (set `IMAGE_GENERATOR = "replicate"`)

### 3. Python path

Pipeline scripts expect to be run with `services/python-generator/scripts` on `PYTHONPATH`. The `pnpm pipeline` launcher sets this automatically. If running Python directly, set:

```bash
export PYTHONPATH="$(pwd)/services/python-generator/scripts"
```

### 4. YouTube upload (optional)

- [ ] Create OAuth 2.0 Desktop app in [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Enable YouTube Data API v3
- [ ] Download credentials JSON → save as `credentials.json` in `services/python-generator/` or project root
- [ ] First upload run triggers OAuth flow; browser opens for consent → creates `token.json` in `services/python-generator/scripts/` (or generation root)

### 5. AWS (optional, for SST deploy)

- [ ] `aws configure` or env vars for AWS credentials
- [ ] `pnpm sst:dev` / `pnpm sst:deploy` for Fargate pipeline

---

## End-to-end flow (per run)

### Single content (one video from one file)

1. [ ] Put raw content in a file (e.g. `content.txt`)
2. [ ] Run pipeline:
   ```bash
   pnpm pipeline -- pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown
   ```
3. [ ] Verify in Remotion Studio: `pnpm dev` → pick composition by `{configHash}_{cacheKey}` from `public/shortgen/index.json`
4. [ ] Pipeline includes render step; output: `services/python-generator/cache/{configHash}/videos/{cacheKey}/short.mp4`

### Source breakdown (multiple videos from one source)

1. [ ] Put source file (e.g. `book.txt`) in place
2. [ ] Run pipeline:
   ```bash
   pnpm pipeline -- pipeline/run_source_pipeline.py -f book.txt -c default
   ```
3. [ ] One video per nugget per config; eval-dataset.json written for eval UI
4. [ ] Preview in Remotion Studio; renders go to `cache/{configHash}/videos/{cacheKey}/short.mp4`

### Upload to YouTube (optional)

Single video:

```bash
pnpm pipeline -- upload/upload_youtube.py --cache-key <cache_key> --config default --video path/to/short.mp4
```

Breakdown (all nuggets):

```bash
pnpm pipeline -- upload/upload_youtube.py --breakdown-hash <source_hash> -c default
```

---

## Checklist summary

| Step                    | Manual? | Notes                                      |
| ----------------------- | ------- | ------------------------------------------ |
| `pnpm install`          | Once    | Node deps                                  |
| Python venv + pip       | Once    | `.venv` in services/python-generator       |
| `pnpm schemas:py`       | Once    | After clone; after schema edits             |
| `.env` with API keys    | Once    | OPENAI, ANTHROPIC, ELEVENLABS, etc.        |
| `credentials.json`      | Once    | YouTube OAuth (optional)                    |
| Run pipeline            | Per run | `pnpm pipeline -- pipeline/run_source_pipeline.py ...` |
| Remotion Studio         | Per run | `pnpm dev` to preview                      |
| YouTube upload          | Per run | Optional; after render                     |

---

## Troubleshooting

- **"credentials.json not found"** — Place OAuth client secrets in `services/python-generator/credentials.json` or project root.
- **"No refresh_token in token.json"** — Re-run upload; OAuth flow must complete without early cancellation.
- **schemas:py fails** — Ensure Python venv exists and `datamodel-code-generator` is installed: `pip install datamodel-code-generator`.
- **Remotion can't find manifest** — Ensure prepare step ran; `public/shortgen/{configHash}_{cacheKey}/manifest.json` must exist.
