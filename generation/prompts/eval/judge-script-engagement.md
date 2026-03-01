# Script Judge: Engagement

Evaluate a short-form script on **Engagement** as a **casual short-form viewer**, not a domain expert. Judge independently. **Favor PASS** when the hook gives any clear indication of what the viewer will learn or achieve. Be lenient—when in doubt, PASS. Reserve FAIL for hooks that are genuinely generic or that open with an abstract definition of a concept.

---

## Dimension: Engagement

**Question:** Would a viewer keep watching?

**PASS if:**

- Hook creates _some_ reason to keep watching. The bar is: **either** a relatable problem/stake **or** a concrete promise. Both are not required.
- **Outcome-focused hooks** pass: stating a specific result the viewer will achieve
- **Topic-driven hooks** pass when the topic itself implies high value (e.g., "how to escape the rat race", "how to get motivated"). Explicit tension/contrast is not required if the promise of learning is clear.
- **Personal story hooks** pass when they set up a lesson or insight (e.g., "I realized I should figure out what to do with this money").
- **Meta-intros** pass when they announce a specific topic or value (e.g., "Today I want to share one of the only feasible methods..."). Do not fail for phrases like "I want to go over" if the rest of the sentence is specific.
- **Format announcements** pass when they announce N tips, steps, or ways. Promising to reveal a secret, share tips, or go over a list creates curiosity.
- **Question hooks** pass when they name a contrast, gap, or common struggle. The tension can be implicit.
- Hook is delivered in the first 1–2 sentences. Minor setup before the hook is OK.
- Does **not** give away the full payoff in the hook.
- Pacing is generally engaging; don't penalize for occasional setup in the body.

**FAIL if:**

- Hook is a generic platitude (e.g. "Success is hard") with no specific angle
- Multiple sentences of clear setup _before_ the hook lands
- **Vague metaphors** without a tangible problem. "Life is a blank canvas" or "Captain of your ship" FAIL unless they immediately link to a specific, tangible **real-world** struggle (e.g., "feeling stuck in a dead-end job"). If the hook stays within the metaphor (e.g. "paint your masterpiece"), FAIL.
- **Abstract definitions** that open by defining a concept without tension, curiosity, or a concrete stake
- Question that does not identify a contrast, gap, or struggle
- Immediately answers or hints at the full answer in the hook
- **Niche topics** with jargon that isn't unpacked
- Hook is abstract or hard to parse; viewer would not grasp the stakes

**Decision cue:**
1. **Check for Vague Metaphors first.** If the hook uses a metaphor like "blank canvas", "captain of your ship", or "architect of your life" without immediately naming a specific real-world problem (e.g. "debt", "breakup"), **FAIL**. Do not credit it for "curiosity" or "visual analogy".
2. **Check for Platitudes.** If the hook is a generic statement ("Success is hard"), **FAIL**.
3. Otherwise, if it reveals a secret, asks a contrast question, announces tips/steps, or shares a relevant personal story, **PASS**.

---

## Few-Shot Examples

**PASS:**
- "Why do some messages inspire us deeply, while others are easily ignored?" — contrast question with implicit stakes
- "Today I'm going to go over the top three careers that are currently in high demand..." — stacked promises, format announcement
- "Today I want to reveal to you the secret to getting better at talking to people" — secret reveal with clear domain
- "Today I want to share with you one of the only feasible methods that I know of for escaping the rat race" — meta-intro with high-value topic
- "I want to go over the most common forms of meditation: how each of them work, what benefits each bring" — meta-intro with specific breakdown
- "I never cared much about investing... I realized I should figure out what to do with this money" — personal story leading to a topic/insight

**FAIL:**
- "The Golden Circle model: it's a way inspiring leaders communicate from the inside out" — opens with abstract definition, no tension or stake
- "Ever feel like life's just happening to you, and you're standing by? It's time to become the captain of your ship" — vague metaphor with no concrete promise
- "Parkinson's Law states that work expands to fill the time available" — definition only, no hook
- "What if your life was a blank canvas, waiting for you to paint your own masterpiece?" — vague metaphor, no concrete problem
- "Imagine you are the architect of your life" — vague metaphor
- "The Secret to Believing in Yourself!" — (if the hook text is just the title re-stated without a new angle)
- "What if your life was a blank canvas, and you held the brush?" — vague metaphor
- "Most people build their life without a blueprint" — vague metaphor

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
