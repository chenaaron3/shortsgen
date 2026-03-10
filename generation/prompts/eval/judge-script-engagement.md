# Script Judge: Engagement

Evaluate a short-form script on **Engagement** as a **casual short-form viewer**, not a domain expert. Judge independently.

---

## Dimension: Engagement

**Question:** Would a viewer keep watching?

### Primary criterion

**Does the hook create a reason to keep watching (an open loop)?**

The hook is typically the **first 1–2 sentences** (or first ~3 seconds). Judge the hook primarily; do not let a strong body “rescue” a weak hook.

**Lean PASS** if there is a clear, specific reason to continue (usefulness, curiosity, relevance, or story momentum). **Only FAIL** when the hook is generic/abstract/vague or delayed.

---

## PASS if

The hook creates an open loop using **any** of these strategies (all count equally):

1. **Relatable problem + implied or explicit payoff**

- Names a struggle, friction, or mistake, and implies you’ll explain/fix it.
- The promise can be **implied** (“That’s why…”) — it doesn’t need to be fully spelled out.
- Example: “Most people fail to change habits because they focus on the wrong thing.”

2. **Outcome focus**

- Promises a practical result the viewer wants (even if not hyper-specific).
- **Direct promise language counts.** Hooks like “Today I’m going to show you…”, “Here’s the secret to…”, “I’ll teach you how to…”, “I’m going to break down…” are **Outcome focus** as long as the outcome/topic is concrete (e.g., “get better at talking to people,” “boost your testosterone,” “fall asleep faster”).
- Example: “Do this tonight and you’ll fall asleep faster.”
- Example: “Today I want to reveal the secret to getting better at talking to people.”

3. **Topic-driven (understand X / learn X)**

- Promises to explain a concept clearly with a defined scope.
- Scope can be categories or a short agenda; it doesn’t need a dramatic payoff.
- Example: “There are three types of meditation—here’s what each one trains.”

4. **Value / novelty announcement**

- Signals the viewer will get _useful_ or _uncommon_ info, tips, or a method.
- “You haven’t heard” / “most people miss” / “the surprising trick” are valid open loops **when the topic is concrete**.
- Examples:
  - “These are studying tips you probably haven’t heard of.”
  - “Here are three ways to improve your focus—starting with the easiest.”

5. **Personal story (relatable → lesson)**

- A specific moment that naturally makes you want the next line (what happened / what changed / what they learned).
- Example: “When I first started going on dates, I’d get so nervous I couldn’t think straight…”

6. **Meta intro (stakes / suspense framing)**

- Frames a compelling situation or claim that implies an explanation is coming.
- Example: “There’s one realistic way people escape the rat race—and most people ignore it.”

### Question hooks (allowed, but demoted / higher bar)

A hook that uses a question can PASS, but it should be treated as a **weaker default format** than a strong direct statement.

PASS only when:

- The question is **about a concrete topic** (not vague therapy-speak).
- It creates a clear “I want to know” loop **by itself**, OR the next line begins answering/explaining.
- One question max.
- A direct statement version would **not obviously be stronger**.

If a hook could work equally well as a **question** or a **direct statement/claim/promise**, prefer the **direct statement**.

FAIL when:

- It’s generic (“Ever feel like…”, “What if…”, “Have you ever noticed…” with no concrete topic).
- It stacks questions.
- It delays the hook (multiple setup lines before any payoff/angle appears).

---

## FAIL if

- **No open loop:** the hook does not suggest what the viewer will get next (no problem, no topic, no value, no story momentum, no stakes).
- **Vague metaphor** without immediate concrete grounding.
  - Example: “Life is a blank canvas…” (FAIL unless immediately tied to a tangible struggle or lesson)
- **Abstract definition-only opener** with no angle/payoff.
  - Example: “Parkinson’s Law is…” (FAIL unless immediately tied to why it matters / what you’ll do with it)
- **Platitude** with no specific angle.
  - Example: “Success is hard.”
- **Generic intention statements:** “Today I want to talk about X” FAIL **only if X is generic** (e.g., “success,” “happiness,” “motivation”) and there’s no concrete deliverable (no secret/steps/ways/how-to).
- **Late hook:** multiple sentences of setup before any clear reason to keep watching.
- **Full payoff in hook:** it gives away the entire answer immediately (no reason to continue).
- **Weak question hook:** it uses a question format where a direct statement/claim/promise would be stronger.

---

## Decision cue

1. Identify the hook (first 1–2 sentences).
2. Ask: “Would a casual viewer expect something useful/interesting immediately?”
   - If yes → PASS (unless it’s vague metaphor / platitude / definition-only / late / full payoff).
3. If it’s a question hook: PASS only if specific, concrete, not dragging, and **not obviously weaker than a direct statement version**; otherwise FAIL.

---

## Suggestion preference

When suggesting an improvement for a failing hook, **do not default to rewriting it as a question**. Prefer a **direct statement, claim, problem + payoff, or outcome promise**. Only suggest a question hook if it is clearly stronger than a statement version.

---

## Few-Shot Examples

### PASS

- **Value/novelty:** “These are studying tips you probably haven’t heard of.”
- **Topic-driven:** “I’m going to break down the most common forms of meditation—what each one does and who it’s for.”
- **Relatable problem:** “Most people fail to change habits because they focus on the wrong thing.”
- **Outcome focus (direct promise)**: “Today I want to reveal to you the secret to getting better at talking to people.”
- **Outcome focus (list promise)**: “Today I want to go over the top three ways you can boost your testosterone.”
- **Outcome focus:** “Follow these steps and you’ll fall asleep faster tonight.”
- **Story:** “When I first started going on dates, I’d get so nervous I’d blank mid-sentence…”
- **Meta intro:** “There’s one realistic way people escape the rat race—and it’s not what you think.”
- **Question (specific):** “Why does criticism rarely change behavior?” (PASS if the next line starts explaining the mechanism)

### FAIL

- **Generic question:** “Ever feel like life’s just happening to you?”
- **Stacked questions:** “Why do you procrastinate? And how do you stop?”
- **Platitude:** “Success is hard.”
- **Definition-only:** “Parkinson’s Law states that work expands to fill the time available.”
- **Vague metaphor:** “Imagine you are the architect of your life.”
- **Late hook:** multiple lines of setup before any angle/payoff
- **Weak question vs stronger statement:** "Have you ever struggled with focus?" (FAIL if a direct version like "Most people can't focus because they train distraction all day" would be stronger)

---

## Output

Return **only** valid JSON. No markdown, no code fences.

If PASS:
{
"passed": true,
"critique": "Brief rationale citing criteria.",
"suggestion": "",
"suggestion_reasoning": ""
}

If FAIL:
{
"passed": false,
"critique": "Brief rationale citing criteria.",
"suggestion": "Concrete suggested improvement (e.g. a rewritten hook).",
"suggestion_reasoning": "Why this suggestion would fix the issue."
}

- critique: 1–3 sentences. Cite specific phrases that pass or fail.
- suggestion/suggestion_reasoning: only when failing.
