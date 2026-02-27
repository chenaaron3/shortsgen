# Script Eval UI

Manual error analysis for `generate_script.py` output. Evaluate scripts against Engagement, Clarity, and Payoff dimensions.

## Setup

```bash
# Eval dataset is written by run_source_pipeline (run from project root)
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c default claude-sonnet
# Script-only eval (no images/voice/video): add --break script
python generation/scripts/run.py pipeline/run_source_pipeline.py -f book.txt -c default claude-sonnet --break script
```

## Run

```bash
cd eval-ui
npm install
npm run dev
```

Open http://localhost:5173 (or the port Vite reports).

## Usage

1. Select a trace from the sidebar (filter by All / Unreviewed / Reviewed)
2. Review the input (raw content) and script (Hook, Body, Close)
3. For each dimension, mark PASS or FAIL and add a critique
4. In Chunks, Images & Video: mark each image Good or Bad. Bad images require a note explaining the issue.
5. Add optional open-ended notes
6. Click Save to persist to `public/annotations.json`
7. Use Export annotations to download the annotations file

Exported `annotations.json` includes `imageAnnotations` with per-image good/bad markers and notes. Use this file with Cursor to iterate on image generation—filter entries where `imageAnnotations[].marker === "bad"` and use the `note` field for improvement feedback.

## Data

- **Input**: `eval-dataset.json` — written by `run_source_pipeline` when run with one or more configs
- **Chunks, images, video**: When the pipeline runs past script (no `--break script`), `write_eval_dataset` copies chunks.json, images, and short.mp4 to `public/eval-assets/{traceId}/{configHash}/` for traces that have them
- **Output**: `public/annotations.json` — human-reviewed PASS/FAIL judgments and image good/bad markers (gitignored)
- **LLM first pass**: `public/llm-annotations.json` — agent-generated annotations used as defaults. Create via the `script-eval-llm-annotate` Cursor skill (e.g. "Generate LLM annotations for the eval dataset").

The UI merges human and LLM annotations: human always overrides. Traces with only LLM annotations show an "AI first pass" badge; human-reviewed traces show "Reviewed".

## Judge validation (Human vs LLM judge)

To compare the script judge LLM against your human labels and inspect disagreements:

1. Export a golden set (human-reviewed traces):
   ```bash
   python generation/scripts/run.py eval/export_golden_set.py
   ```
2. Run the judge on the golden set:
   ```bash
   python generation/scripts/run.py eval/validate_judges.py
   ```
   This reports agreement rates and writes `public/judge-results.json`.

3. In the eval UI, use the **Disagreements** filter to see traces where the judge disagreed with you. Open a trace and switch model tabs to view the **Judge vs Human** comparison card, which shows a side-by-side table and the judge's critiques for disagreeing dimensions. Use this to decide whether to update your annotation (human error) or improve the judge prompt (LLM error).
