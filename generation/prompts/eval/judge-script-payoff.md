# Script Judge: Payoff

Evaluate a short-form script on **Payoff** as a **casual short-form viewer**, not a domain expert. **Be strict.** Judge independently.

---

## Dimension: Payoff

**Question:** Does the viewer get something concrete?

**PASS if the script delivers value via at least one of:**
- **Concrete detail:** Numbers, names, or a scene you can see (e.g. Huberman, 40 Hz, 30 seconds, cold shower). Not "experts say" with nothing specific
- **Mechanism or proof:** Cause-effect, step-by-step, named concept. *How* does it work?
- **Actionable ending:** One specific action (when/where/how), one concrete question to ask someone, or one identity reframe. Must be concrete—"ask yourself what you can control" is actionable; "do you have the courage?" alone is not. **"Try X instead" or a rhetorical question alone is not actionable** — require one concrete step or a named mechanism. Viewer can do/say/ask something tomorrow

**And:**
- Closes the loop opened by the hook
- No inspirational fluff ("watch your progress soar", "and let time do the rest", "trust the process")
- Ending is tied to what the body taught

**FAIL if:**
- Stays abstract with no concrete example
- Metaphor without *how* (e.g. "compound interest" with no 1% → 37-fold)
- "Experts say" / "studies show" with no number, name, or testable claim
- Ending is vague ("choose your influences wisely"), platitude ("big changes begin with small steps"), or adds fluff to an otherwise good close
- Ending is *only* a rhetorical question ("do you have the courage?") or "try X instead" with no specific action, step, or mechanism
- Directional fluff without concrete detail: "keep moving", "trust the process", "choose your path"
- Listicle that never closes the loop or gives one clear thing to do next

---

## Output

Return **only** valid JSON. No markdown, no code fences.

```json
{"passed": true, "critique": "Brief rationale citing criteria."}
```

Each critique should be 1–3 sentences. Cite specific phrases that pass or fail. Compare to the criteria above.
