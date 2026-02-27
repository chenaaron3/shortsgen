# Script Judge: Engagement, Clarity, Payoff

Evaluate a short-form script on three dimensions. **Be strict.** Each dimension is judged independently. Return a single JSON object with pass/fail and critique for each.

---

## Dimension 1: Engagement

**Question:** Would a viewer keep watching?

**PASS if:**
- Opening creates a **specific** open loop — curiosity, tension, urgency, or surprise
- Makes a promise that triggers an emotion; viewer must _need_ to know
- One punchy line (or two very short). No setup sentence before the hook lands
- Does **not** give away the payoff
- Does **not** use "today I'm going to", "let me show you", "here are" (unless the line still delivers emotional promise)
- Pacing holds attention; no filler or bloat

**FAIL if:**
- Generic or could apply to many topics
- Multiple sentences of setup before the hook lands
- Soft/question-based without real tension
- Immediately answers or hints at the answer
- Matches meta-intros: "Today I want to reveal…", "I'm going to show you exactly how…", "We all want to be happy but…"

---

## Dimension 2: Clarity

**Question:** Is the core idea understandable in one pass?

**PASS if:**
- One clear core idea. You can state it in one sentence
- No clutter, no tangents. Body does not try to cover two or three ideas
- Structure is simple: setup → payoff
- No jargon or confusion

**FAIL if:**
- Vague ("focus on joy", "build social bonds")
- Multiple ideas competing
- Tangents or repetitive restatement of the same idea
- Viewer would ask "what was the point?"

---

## Dimension 3: Payoff

**Question:** Does the viewer get something concrete?

**PASS if the script delivers value via at least one of:**
- **Concrete detail:** Numbers, names, or a scene you can see (e.g. Huberman, 40 Hz, 30 seconds, cold shower). Not "experts say" with nothing specific
- **Mechanism or proof:** Cause-effect, step-by-step, named concept. *How* does it work?
- **Actionable ending:** One specific action (when/where/how), one question to ask, or one identity reframe. Viewer can do/say/ask something tomorrow

**And:**
- Closes the loop opened by the hook
- No inspirational fluff ("watch your progress soar", "and let time do the rest", "trust the process")
- Ending is tied to what the body taught

**FAIL if:**
- Stays abstract with no concrete example
- Metaphor without *how* (e.g. "compound interest" with no 1% → 37-fold)
- "Experts say" / "studies show" with no number, name, or testable claim
- Ending is vague ("choose your influences wisely"), platitude ("big changes begin with small steps"), or adds fluff to an otherwise good close
- Listicle that never closes the loop

---

## Output

Return **only** valid JSON. No markdown, no code fences. One object with all three dimensions:

```json
{
  "engagement": { "passed": true, "critique": "Brief rationale citing criteria." },
  "clarity": { "passed": true, "critique": "Brief rationale citing criteria." },
  "payoff": { "passed": true, "critique": "Brief rationale citing criteria." }
}
```

Each critique should be 1–3 sentences. Cite specific phrases that pass or fail. Compare to the criteria above.
