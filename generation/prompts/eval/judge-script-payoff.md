# Script Judge: Payoff

Evaluate a short-form script on **Payoff** as a **casual short-form viewer**, not a domain expert. Judge independently. **Favor PASS** when the body delivers 2+ actionable items with concrete detail or mechanism—the body can be the payoff even with an absent close. Reserve FAIL for scripts that stay abstract, have only one illustrative example with a vague close, or end with generic reframes.

---

## Dimension: Payoff

**Question:** Does the viewer get something concrete?

**Key rule:** Body with 2+ actionable tips or steps (with mechanism or numbers) = PASS even with no close. Do not require an elaborate close when the body delivered.

**PASS if the script delivers value via at least one of:**

- **Concrete detail:** Numbers, names, or a scene you can visualize. Not "experts say" with nothing specific.
- **Mechanism or proof:** Cause-effect chain, step-by-step, or named concept with clear _how_. Explaining how something works counts as substantive content—when the close then gives the resulting action, PASS.
- **Named concept** with clear application: when the body explained what it means and how to use it, a brief close that echoes it can pass even without numbers.
- **Actionable ending:** One specific action (when/where/how), one concrete question to ask, or one identity reframe the viewer can apply. A directive that restates the body's main action passes when the body gave enough detail to act. When the body explains a mechanism and the close gives the core action in plain terms (e.g., "lead with why" after explaining neocortex/limbic; "talk to more people" after explaining practice), that passes—do not demand extra steps.
- **Body-as-payoff:** When the body delivers 2+ distinct actionable tips with mechanism or concrete detail, an absent or minimal close can pass. A single extended example with multiple concrete steps (e.g., sleep tips: sunlight, bed only for sleep, blue light filter) counts as 2+ actionable items. Informational listicles pass when the body gives usable information (e.g., careers with salaries). A simple close that restates the body's main action passes when the body gave enough detail. A step-by-step process (e.g., get attention → say X → wait) where each step is defined counts as actionable even without sample phrases. Two distinct tricks with mechanism pass even if close is "follow for more." If the body has 2+ implementable items, PASS—do not require an elaborate close. A single illustrative story without implementable steps does not qualify—the close must then give a concrete action.

**And:**

- Closes the loop opened by the hook (or body clearly fulfills the hook's promise)
- No inspirational fluff
- Takeaway is tied to what the body taught

**FAIL if:**

- Stays abstract with no concrete example
- **Vague reframes:** Close that sounds actionable but has no specific how, step, or mechanism. **Single illustrative example + vague close:** When the body has only one story/example (not a mechanism explanation) and the close gives a generic directive, FAIL. A mechanism explanation (how X works) with an actionable close is not "single example."
- **Abstract directives:** Telling the viewer to adopt a belief or mindset without explaining the mechanism
- **Definition-only body:** When the body only defines terms or concepts and the close advises an action, fail—the viewer was not shown how to apply it. At least one grounded illustration of the action in practice is required.
- Metaphor without _how_
- "Experts say" / "studies show" with no number, name, or testable claim
- Ending is only a rhetorical question or platitude
- Directional fluff without concrete detail
- Listicle where neither body nor close gives usable information or a clear thing to do

**Decision cue:** Body with 2+ actionable tips = PASS even without close. Body with mechanism + simple close that restates the action = PASS. Extended example with 2+ implementable steps = treat as 2+ tips, PASS. Informational listicle (careers, salaries) = PASS. One story + vague directive close = FAIL. No concrete content = FAIL.

---

## Few-Shot Examples

**PASS:**
- Body: "40 Hz... 5 minutes before... stare for 30 seconds... cold shower to spike adrenaline." No close. — multiple tips with mechanism, body is payoff
- Body explains neocortex/limbic, close: "Next time you're trying to inspire or connect, lead with 'why.'" — mechanism + actionable close (restatement of action)
- Body explains brain learns through practice, close: "go out there and start talking to more people." — mechanism + simple restatement = PASS
- "Salaries ranging from 100 to 300,000... forty to fifty thousand dollars entry level" for three careers — informational listicle with concrete details
- Body: "caffeine before noon... blue light free bulbs... shower two hours before bed" — three concrete steps, no close needed
- Extended example: "sunlight in the morning, only use bed for sleep, blue light filter" — three steps within one example = 2+ actionable items
- Step-by-step process: "get their attention... say hey I like you let's go on a date... look them in the eye and wait" — steps are the payoff
- Three research-backed tips (sleep, workout, social context) with studies — each tip's insight is the actionable step
- Two tricks (cafe location, quick action) with mechanism, close "follow for more" — body delivered 2+, body-as-payoff

**FAIL:**
- Body: one Dale Carnegie parenting story. Close: "ask yourself: what do they truly want? Shift your pitch, not just your words" — single example + vague directive
- Body defines What/How/Why only. Close: "start with your Why when setting goals" — definition-only, no application shown
- Close: "recognize someone's effort sincerely" or "build up that belief" — abstract directive, no mechanism

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
