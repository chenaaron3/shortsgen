---
name: script-eval-llm-annotate
description: Generates llm-annotations.json for the Script Eval UI. Uses one focused, chain-of-thought evaluation per script in sequence against judge criteria. Use when the user asks to generate LLM annotations, create first-pass annotations, or run script eval annotation.
---

# Script Eval LLM Annotations

Generate first-pass annotations for the Script Eval UI. The agent evaluates each trace against judge criteria and writes `eval-ui/public/llm-annotations.json`. No external API—use the judge prompts as evaluation criteria.

## When to Use

- User asks to generate LLM annotations, create llm-annotations.json, or run first-pass eval
- User wants to annotate the eval dataset

## Reference document

The evaluation criteria are in a single judge file. **Read the full content when performing step 5** (evaluate one script at a time).

- **Judge:** [generation/prompts/eval/judge-script.md](generation/prompts/eval/judge-script.md) — three dimensions: Engagement, Clarity, Payoff

## Workflow

1. **Ensure eval dataset exists**
   - Read `eval-ui/public/eval-dataset.json`
   - If missing: run `python generation/scripts/run.py pipeline/run_source_pipeline.py -f SOURCE -c config1 config2` from project root (or add `--break script` for script-only)

2. **Create temp dir and one file per script**
   - Run from project root:
     ```bash
     python .cursor/skills/script-eval-llm-annotate/scripts/prepare_scripts.py
     ```
   - Optional: limit to first N traces, e.g. `prepare_scripts.py 5`
   - This creates `eval-ui/.eval-scripts/` with one `.txt` file per trace (e.g. `a8bfef0c49a0c028.txt`). Each file contains traceId, title, and `--- HOOK ---` / `--- BODY ---` / `--- CLOSE ---` sections. Also creates `eval-ui/.eval-scripts/judgments/` for per-trace judgment output.

3. **Load judge reference document**
   - Read the full content of [judge-script.md](generation/prompts/eval/judge-script.md) so Engagement, Clarity, and Payoff criteria are in context before creating todos and evaluating scripts.

4. **Create one todo per script file**
   - Use TodoWrite: one todo per file in `eval-ui/.eval-scripts/*.txt` (one per trace). Label by trace id or title (e.g. "Evaluate a8bfef0c49a0c028: The Power of Small Improvements"). Do **not** create a single todo that batches multiple traces.

5. **Evaluate one script at a time (strict)**
   - For each todo, in sequence:
     - **Read exactly one file**: open `eval-ui/.eval-scripts/<traceId>.txt`. That file is the only script content you use for this step. Do not read other script files or the full eval-dataset.json in the same step.
     - **Evaluate that single script** with chain of thought driven by `judge-script.md`. For each dimension (Engagement, Clarity, Payoff), apply the criteria, reason stepwise, then output pass/fail and critique.
     - **Write one judgment file**: save to `eval-ui/.eval-scripts/judgments/<traceId>__<model>.json` (or `<traceId>.json` when model unknown) with content:
       `{ "traceId": "<id>", "model": "<configName>", "judgments": [ { "dimension": "engagement", "pass": bool, "critique": "..." }, { "dimension": "clarity", ... }, { "dimension": "payoff", ... } ], "reviewedAt": "ISO8601" }`
     - Mark that todo complete. Then move to the next todo; again read only one file and write only one judgment file. Each script gets its own dedicated attention—no batching.

6. **Merge judgments and output breakdown**
   - Run merge script (from project root):
     ```bash
     python .cursor/skills/script-eval-llm-annotate/scripts/merge_judgments.py
     ```
   - This writes `eval-ui/public/llm-annotations.json` from all files in `eval-ui/.eval-scripts/judgments/`.
   - Run breakdown and show output:
     ```bash
     python .cursor/skills/script-eval-llm-annotate/scripts/breakdown.py
     ```
   - Optional: add `eval-ui/.eval-scripts/` to `.gitignore` or delete the temp dir after use.

## Optional

- Dry run: run `prepare_scripts.py 5` to create only 5 script files; then create 5 todos and evaluate those. User can say "annotate first 5 traces" to test.

## Output Schema

Each judgment: `{ dimension: "engagement" | "clarity" | "payoff", pass: boolean, critique: string }`

All three dimensions (engagement, clarity, payoff) required per trace.
