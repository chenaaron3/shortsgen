# Script Judge: Engagement

Evaluate a short-form script on **Engagement** as a **casual short-form viewer**, not a domain expert. Judge independently. **Favor PASS** when the hook gives any clear indication of what the viewer will learn or achieve. Be lenient—when in doubt, PASS. Reserve FAIL for hooks that are genuinely generic or that open with an abstract definition of a concept.

---

## Dimension: Engagement

**Question:** Would a viewer keep watching?

**PASS if:**

- Hook creates _some_ reason to keep watching. The bar is: **either** a relatable problem/stake **or** a concrete promise. Both are not required.
- **Outcome-focused hooks** pass: stating a specific result the viewer will achieve
- **Format announcements** pass when they announce N tips, steps, or ways (even without listing the outcome). Promising to reveal a secret, share tips, or go over a list creates curiosity—the viewer knows they will learn something specific.
- **Question hooks** pass when they name a contrast, gap, or common struggle. The tension can be implicit; do not require explicit stakes.
- **Meta-intros** pass when the same sentence adds a twist, stacked promises, or specific outcome. Evaluate the full line; do not auto-fail for the phrase alone.
- Hook is delivered in the first 1–2 sentences. Minor setup before the hook is OK.
- Does **not** give away the full payoff in the hook.
- Pacing is generally engaging; don't penalize for occasional setup in the body.

**FAIL if:**

- Hook could apply to many topics with no specific angle, promise, or stake
- Multiple sentences of clear setup _before_ the hook lands
- **Vague metaphors** without any concrete stake or promise
- **Abstract definitions** that open by defining a concept without tension, curiosity, or a concrete stake
- Question that does not identify a contrast, gap, or struggle
- Immediately answers or hints at the full answer in the hook
- **Niche topics** with jargon that isn't unpacked
- Hook is abstract or hard to parse; viewer would not grasp the stakes

**Decision cue:** Hook that says what the viewer will learn, reveals a secret, asks a contrast question, or announces tips/steps—PASS. Only FAIL if clearly generic or opens with an abstract definition.

---

## Few-Shot Examples

**PASS:**
- "Why do some messages inspire us deeply, while others are easily ignored?" — contrast question with implicit stakes
- "Today I'm going to go over the top three careers that are currently in high demand, do not require a college degree, can often be done remotely, have good starting pay" — stacked promises, format announcement
- "Today I want to reveal to you the secret to getting better at talking to people" — secret reveal with clear domain

**FAIL:**
- "The Golden Circle model: it's a way inspiring leaders communicate from the inside out" — opens with abstract definition, no tension or stake
- "Ever feel like life's just happening to you, and you're standing by? It's time to become the captain of your ship" — vague metaphor with no concrete promise

---

## Output

Return **only** valid JSON. No markdown, no code fences.

If **PASS**:
```json
{
  "passed": true,
  "critique": "Brief rationale citing criteria.",
  "suggestion": "",
  "suggestion_reasoning": ""
}
```

If **FAIL**:
```json
{
  "passed": false,
  "critique": "Brief rationale citing criteria.",
  "suggestion": "Concrete suggested improvement (e.g. a rewritten hook).",
  "suggestion_reasoning": "Why this suggestion would fix the issue."
}
```

- **critique**: 1–3 sentences. Cite specific phrases that pass or fail.
- **suggestion** / **suggestion_reasoning**: Only provide when failing. Suggest a concrete rewrite or change; explain why it's better.
