---
name: improve-pairwise-judge
description: Improves the pairwise script judge that predicts which short-form video script would perform better with viewers. Use when iterating on the judge, improving alignment with view-count gold labels, or debugging judge accuracy.
---

# Improve Pairwise Judge

## Overview

The judge compares two scripts (A vs B) and picks the winner. Gold labels come from view counts: the script whose video got more views (normalized within 90-day windows) wins. Goal: maximize alignment (accuracy) with gold.

## Key Files

| File | Role |
|------|------|
| `generation/scripts/judge/judge.py` | LLM inference, batch eval |
| `generation/scripts/judge/prompts/pairwise-judge-system-prompt.md` | System prompt + inline few-shot examples |
| `generation/scripts/judge/build_pairwise_dataset.py` | Build pairwise.jsonl from index.json |
| `generation/cache/judge/pairwise.jsonl` | Dataset (script_a, script_b, winner, video_id_a, video_id_b) |
| `generation/cache/judge/judge-results.json` | Batch output (accuracy, results) |

## Workflow

1. **Build dataset** (optional if pairwise.jsonl exists):
   ```bash
   python generation/scripts/run.py judge/build_pairwise_dataset.py --max-pairs 250
   ```

2. **Run judge**:
   ```bash
   python generation/scripts/run.py judge/judge.py --batch generation/cache/judge/pairwise.jsonl
   ```

3. **Analyze results**: Check accuracy, Gold A vs Gold B breakdown, error distribution.

## Validation

- **Overall accuracy**: correct / total
- **Position bias**: Gold A accuracy vs Gold B accuracy. If Gold B << Gold A, the model favors the first script.
- **Error balance**: `pred=A when gold=B` vs `pred=B when gold=A`. Imbalanced = position bias.

## Improvement Strategies

### 1. System prompt
- Strengthen anti-position-bias language
- Add calibration: "Scripts that earn their conclusion outperform those that over-promise"
- Add criteria: hook, clarity, payoff, authenticity
- Warn against favoring "louder" scripts (vivid metaphors, shocking stats)

### 2. Few-shot examples
- Include balanced A and B winners in the system prompt
- Use real examples from pairwise.jsonl (truncate ~300–500 chars)
- Ensure examples show both positions winning

### 3. Dataset
- `--min-margin 0.5`: stronger signal, fewer pairs
- `--max-pairs N`: control eval size
- A/B shuffle uses `hash((video_id_a, video_id_b))` in build_pairwise_dataset—do not align judge logic with dataset shuffle

## Pitfalls

- **Swap alignment**: If judge swaps presentation order using the same parity as the dataset shuffle (e.g. both use idx%2), the winner ends up first every time—inflating accuracy. Use content-based (hash) or no swap.
- **Position bias**: Without countermeasures, models often favor the first script. Check Gold A vs Gold B accuracy.
- **Over-weighting hooks**: The judge may prefer "strong hook" scripts; gold often favors subtler, more authentic scripts.

## Iteration Loop

1. Run judge, capture accuracy and breakdown
2. Identify pattern (position bias? hook bias? specific error types?)
3. Edit prompt or examples
4. Re-run and compare
5. Repeat until target (e.g. 80%) or diminishing returns
