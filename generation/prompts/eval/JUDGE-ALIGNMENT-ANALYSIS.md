# Judge vs Human Alignment Analysis

Based on 32 golden-set entries.

**Baseline (before edits):** engagement 38%, clarity 59%, payoff 66%

**After prompt edits, gpt-4o-mini:** engagement **47%** (+9), clarity **66%** (+7), payoff 66% (unchanged)

**gpt-4o (stronger model):** engagement **53%** (+15 from baseline), clarity **53%** (-6 vs mini), payoff 66% (same)

| Model        | Engagement | Clarity | Payoff |
|--------------|------------|---------|--------|
| gpt-4o-mini  | 47%        | 66%     | 66%    |
| gpt-4o       | 53%        | 53%     | 66%    |

**gpt-4o trade-off:** Better at engagement (fewer false negatives on meta-intros) but *more lenient* overall—14 engagement and 15 clarity cases where human FAIL, judge PASS. Use `validate_judges.py --model gpt-4o` to compare.

---

## 1. Disagreement Patterns

| Dimension   | Judge stricter (H✓ J✗) | Judge lenient (H✗ J✓) |
|-------------|------------------------|------------------------|
| Engagement  | 9                      | 11                     |
| Clarity     | 2                      | 11                     |
| Payoff      | 2                      | 9                      |

**Summary:** The judge is *stricter* on engagement (especially meta-intros) and *lenient* on clarity/payoff compared to humans. Clarity and payoff skew toward the judge being too forgiving.

---

## 2. Root Causes

### A. Engagement — Judge too strict (9 cases)

**Pattern:** Judge fails hooks that humans passed because of meta-intro phrases.

**Examples where human PASS, judge FAIL:**
- "Today I want to show you what it actually means to be proactive—and it's not what most people think."
- "Today I'm going to show you exactly how to build a life you actually want."
- "Today I'm going to show you exactly how to stop feeling responsible for other people's problems."

**Judge rationale:** "Uses meta-intro with 'Today I want to show you', fails to create immediate tension."

**Human perspective:** The second clause ("and it's not what most people think", "exactly how to build a life you actually want") *does* create curiosity and a promise. The rule is applied too mechanically — the judge auto-fails on the phrase without considering whether the *full* hook delivers an open loop.

**Proposal:** Refine the meta-intro rule. Allow PASS when the full opening creates a genuine open loop *despite* containing meta-intro phrasing. Add an exception: "If the hook adds a twist, contradiction, or specific promise in the same sentence, evaluate the whole line—don't auto-fail on the phrase alone."

---

### B. Engagement — Judge too lenient (11 cases)

**Pattern:** Judge passes hooks that humans failed. Common themes:
- **Audience fit:** Human: "No one wakes up thinking they want to build a habit-forming product" (too niche)
- **Relatability:** Human: "Not relatable"
- **Abstract/confusing:** Human: "The hook is hard to reason about, too abstract"
- **Adlerian/psychology content:** Human failed several Adler-heavy scripts (Teleology vs Aetiology, Build Horizontal, Don't Get Drawn into Power Struggles, Community Feeling)

**Judge perspective:** The judge evaluates structure (open loop, tension, promise) but does *not* consider whether the topic resonates with a general short-form audience. It passes hooks that are structurally sound but niche or jargon-heavy.

**Proposal:** Add an **audience-fit** check to engagement: "Consider whether a casual viewer would care. Niche topics (habit-forming products, Adlerian psychology concepts) need an especially relatable angle. Jargon (aetiology, teleology) without quick unpacking can fail engagement even if the structure is sound."

---

### C. Clarity — Judge too lenient (11 cases)

**Pattern:** Judge passes when human failed. Often co-occurs with engagement disagreements.

**Examples:**
- Human: "The hook is very confusing"
- Human: "They'll tell you they want cinema-quality home movies... The 5 why is too cluttered"
- Human: "Multiple ideas competing" / "goalpost analogy overused, not explained well"

**Judge perspective:** The judge checks for "one clear core idea" and "no clutter" but may accept scripts where the *body* is clear while the *hook* is muddled, or where multiple concepts are presented in rapid succession.

**Proposal:** Tighten clarity: "Evaluate the *whole* script. If the hook or transition is confusing, that hurts clarity. Multiple principles or examples in quick succession can fail clarity even if each is clear in isolation. Require that a viewer could state the core idea in one sentence *after* watching."

---

### D. Payoff — Judge too lenient (9 cases)

**Pattern:** Judge passes when human wanted more concrete value.

**Examples:**
- Human: "I don't feel like I learned anything after"
- Human: "The goalpost analogy is overused, not explained well"
- Human (Happiness is Contribution): Passed — but judge failed, saying "Keep moving in the direction of contribution" is vague. (This one is judge stricter.)
- Human often fails when the closing is a *question* ("do you have the courage to choose differently?") without a concrete next step.

**Proposal:** Clarify payoff criteria: "A rhetorical question alone ('do you have the courage?') is not actionable unless paired with a specific action. Prefer endings that give one thing to *do* (when/where/how) over questions that merely invite reflection. Vague direction ('keep moving', 'trust the process') fails."

---

## 3. Recommended Prompt Changes

### Change 1: Engagement — Nuance the meta-intro rule

**Current (FAIL):**
> Matches meta-intros: "Today I want to reveal…", "I'm going to show you exactly how…"

**Proposed addition to PASS:**
> - **Exception:** If the meta-intro is *immediately* followed by a twist, contradiction, or specific promise in the same sentence (e.g. "Today I want to show you X—and why most people get it wrong"), evaluate the full line. PASS if the complete hook creates curiosity or tension; don't auto-fail on the phrase alone.

**Proposed refinement to FAIL:**
> - Matches meta-intros *without* a compensating twist: "Today I want to reveal…", "I'm going to show you exactly how…" (if the rest of the line adds no curiosity or tension)

---

### Change 2: Engagement — Add audience-fit guidance

**Add to FAIL:**
> - Topic is too niche without a relatable angle (e.g. "habit-forming products" for a general audience; Adlerian jargon like aetiology/teleology without quick unpacking)
> - Hook is abstract or hard to parse; viewer would not immediately grasp the stakes

---

### Change 3: Clarity — Whole-script and multi-idea checks

**Add to FAIL:**
> - Hook or key transition is confusing; viewer cannot follow the setup
> - Multiple ideas or principles in rapid succession without a single unifying thread; viewer would struggle to state "the point" in one sentence
> - Jargon (aetiology, teleology, etc.) without clear definition in context

---

### Change 4: Payoff — Stricter on questions and vague closes

**Add to FAIL:**
> - Ending is *only* a rhetorical question ("do you have the courage?") with no specific action, step, or mechanism
> - "Keep moving", "trust the process", "choose your path" — directional phrases without concrete detail
> - Listicle of principles without a clear *one thing* to do next

**Add to PASS (clarify):**
> - Actionable ending: must include either (a) one specific action (when/where/how), or (b) one concrete question to ask someone (not just "ask yourself" a vague prompt), or (c) a named mechanism with steps

---

## 4. Additional Improvements

### A. Few-shot examples (optional)

Add 1–2 worked examples to the prompt: one PASS and one FAIL per dimension, with brief rationale. Reduces variance and anchors the judge to human expectations.

### B. Calibration pass

After editing the prompt, re-run `validate_judges.py` and compare:
- Engagement: target 60%+ (up from 38%)
- Clarity: target 75%+ (up from 59%)
- Payoff: target 75%+ (up from 66%)

### C. Human label review

Some disagreements may reflect inconsistent human labels (e.g. 73a3c82600677c17 default vs mixed — same topic, opposite verdicts). Use the Disagreements view to spot and resolve these. Consider re-annotating edge cases after prompt changes.

### D. Model upgrade

**Tested gpt-4o.** Result: engagement improves (53% vs 47%) but clarity drops (53% vs 66%). gpt-4o is systematically *more lenient*—passes engagement/clarity when humans fail, especially on Adlerian content, habit-forming products, and social-skills scripts. **Recommendation:** Stick with gpt-4o-mini for now; it balances strict/lenient better. If you need to reduce false negatives (scripts wrongly failed), gpt-4o helps there but increases false positives.

---

## 5. gpt-4o Disagreement Patterns (detailed)

**Judge lenient (H✗ J✓) dominates:**
- Engagement: 14 cases (Adlerian scripts, internal triggers, Power of a Smile, Importance of Names)
- Clarity: 15 cases (same content types; gpt-4o finds structure clear when humans found it confusing)
- Payoff: 10 cases

**Recurring lenient-pass content:** Adlerian psychology (Teleology, Life is Not Linear, Feelings of Inferiority, Build Horizontal, Don't Get Drawn into Power Struggles, Community Feeling), habit-forming products ("source" internal triggers), social skills (Power of a Smile, Importance of Names, Criticism Doesn't Work).

**Hypothesis:** gpt-4o understands niche/jargon content well and judges it pass-worthy. Humans may be applying a "would a casual viewer get this?" bar that gpt-4o doesn't. To align with humans, the prompt could add: "Evaluate as a casual short-form viewer, not a domain expert."

---

## 6. Summary of Proposed Edits

| Priority | Change | Expected impact |
|----------|--------|-----------------|
| High | Engagement: meta-intro exception when full hook creates open loop | +5–8% engagement |
| High | Engagement: audience-fit / niche-topic FAIL | +3–5% engagement |
| High | Clarity: whole-script + multi-idea checks | +5–8% clarity |
| High | Payoff: rhetorical-question / vague-close FAIL | +5–8% payoff |
| Medium | Few-shot examples | Reduces variance |
| Low | Model upgrade (gpt-4o) | Unknown; test first |
