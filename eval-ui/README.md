# Script Eval UI

Manual error analysis for `generate_script.py` output. Evaluate scripts against Hook, Body, and Ending dimensions.

## Setup

```bash
# Build eval dataset from breakdowns (run from project root)
python3 generation/scripts/run.py eval/build_eval_dataset.py
# Or: npm run eval:build
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
4. Add optional open-ended notes
5. Click Save to persist to `public/annotations.json`
6. Use Export annotations to download the annotations file

## Data

- **Input**: `eval-dataset.json` — built from `generation/cache/_breakdowns/*/breakdown.json`
- **Output**: `public/annotations.json` — human-reviewed PASS/FAIL judgments (gitignored)
- **LLM first pass**: `public/llm-annotations.json` — agent-generated annotations used as defaults. Create via the `script-eval-llm-annotate` Cursor skill (e.g. "Generate LLM annotations for the eval dataset").

The UI merges human and LLM annotations: human always overrides. Traces with only LLM annotations show an "AI first pass" badge; human-reviewed traces show "Reviewed".
