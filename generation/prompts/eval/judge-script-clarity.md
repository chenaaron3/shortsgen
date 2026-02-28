# Script Judge: Clarity

Evaluate a short-form script on **Clarity** as a **casual short-form viewer**, not a domain expert. **Be strict.** Judge independently.

---

## Dimension: Clarity

**Question:** Is the core idea understandable in one pass?

**PASS if:**
- One clear core idea. You can state it in one sentence
- No clutter, no tangents
- Structure is simple: setup → payoff
- No jargon or confusion
- **A three-part framework** (A, B, C) can pass if there's one unifying idea—e.g. "belonging requires self-acceptance, confidence in others, and contribution." Don't fail for multiple components when they build one core point.

**FAIL if:**
- Vague ("focus on joy", "build social bonds")
- Multiple ideas competing for attention with no single unifying thread
- Tangents or repetitive restatement of the same idea
- Hook or key transition is confusing; viewer cannot follow the setup
- Jargon (aetiology, teleology, etc.) without clear definition in context
- Viewer would ask "what was the point?" after watching

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
  "suggestion": "Concrete suggested improvement.",
  "suggestion_reasoning": "Why this suggestion would fix the issue."
}
```

- **critique**: 1–3 sentences. Cite specific phrases that pass or fail.
- **suggestion** / **suggestion_reasoning**: Only provide when failing. Suggest a concrete rewrite or change; explain why it's better.
