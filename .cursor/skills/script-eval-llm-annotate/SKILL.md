---
name: script-eval-llm-annotate
description: Generates llm-annotations.json for the Script Eval UI. Uses one focused, chain-of-thought evaluation per script in sequence against judge criteria. Use when the user asks to generate LLM annotations, create first-pass annotations, or run script eval annotation.
---

# Script Eval LLM Annotations

Generate first-pass annotations for the Script Eval UI. The agent evaluates each trace against judge criteria and writes `eval-ui/public/llm-annotations.json`. No external API—use the judge prompts as evaluation criteria.

## When to Use

- User asks to generate LLM annotations, create llm-annotations.json, or run first-pass eval
- User wants to annotate the eval dataset

## Reference documents

The evaluation criteria are defined in the judge files. **Read the full content of these files when performing step 5** (evaluate one script at a time); use them as the authoritative source for criteria, diagnostics, pass/fail rules, and reference bars.

- **Hook:** [generation/prompts/eval/judge-hook.md](generation/prompts/eval/judge-hook.md)
- **Body:** [generation/prompts/eval/judge-body.md](generation/prompts/eval/judge-body.md)
- **Ending:** [generation/prompts/eval/judge-ending.md](generation/prompts/eval/judge-ending.md)

## Workflow

1. **Ensure eval dataset exists**
   - Read `eval-ui/public/eval-dataset.json`
   - If missing: run `python generation/scripts/run.py eval/build_eval_dataset.py` from project root

2. **Create temp dir and one file per script**
   - Run from project root:
     ```bash
     python .cursor/skills/script-eval-llm-annotate/scripts/prepare_scripts.py
     ```
   - Optional: limit to first N traces, e.g. `prepare_scripts.py 5`
   - This creates `eval-ui/.eval-scripts/` with one `.txt` file per trace (e.g. `a8bfef0c49a0c028.txt`). Each file contains traceId, title, and `--- HOOK ---` / `--- BODY ---` / `--- CLOSE ---` sections. Also creates `eval-ui/.eval-scripts/judgments/` for per-trace judgment output.

3. **Load judge reference documents**
   - Read the full content of the three judge files (see [Reference documents](#reference-documents) above) so their criteria, diagnostics, pass/fail rules, and reference bars are in context before creating todos and evaluating scripts.

4. **Create one todo per script file**
   - Use TodoWrite: one todo per file in `eval-ui/.eval-scripts/*.txt` (one per trace). Label by trace id or title (e.g. "Evaluate a8bfef0c49a0c028: The Power of Small Improvements"). Do **not** create a single todo that batches multiple traces.

5. **Evaluate one script at a time (strict)**
   - For each todo, in sequence:
     - **Read exactly one file**: open `eval-ui/.eval-scripts/<traceId>.txt`. That file is the only script content you use for this step. Do not read other script files or the full eval-dataset.json in the same step.
     - **Evaluate that single script** with chain of thought **driven by the judge files** in `generation/prompts/eval/`. For each dimension, use the full content of the corresponding judge file (criteria, diagnostic, pass/fail rules, reference bar, reject list) to reason stepwise; then output pass/fail and critique.
       - **Hook:** Use `judge-hook.md`: run the Diagnostic, apply Strict criteria and Reference (gold standard / what to reject). Reason stepwise from that file → pass/fail and critique.
       - **Body:** Use `judge-body.md`: evaluate against SUCCES per the file; run the Diagnostic; apply the Pass/fail rule and reference examples. Reason stepwise from that file; critique format per the judge’s Output section → pass/fail and critique.
       - **Ending:** Use `judge-ending.md`: run the Diagnostic, apply Pass/fail rule and Reference (good vs reject). Reason stepwise from that file → pass/fail and critique.
     - **Write one judgment file**: save to `eval-ui/.eval-scripts/judgments/<traceId>.json` with content:
       `{ "traceId": "<id>", "judgments": [ { "dimension": "hook", "pass": bool, "critique": "..." }, { "dimension": "body", ... }, { "dimension": "ending", ... } ], "reviewedAt": "ISO8601" }`
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

Each judgment: `{ dimension: "hook" | "body" | "ending", pass: boolean, critique: string }`

All three dimensions (hook, body, ending) required per trace.
