# Script Judge: Clarity (Balanced)

Evaluate a short-form script on **Clarity** as a casual short-form viewer (5th-grade comprehension).

Clarity has two parts:

A) **Groundedness (Anchors):** Is the idea tied to something visualizable or directly doable?  
B) **Delivery clarity (Flow):** Is it easy to follow on one listen, with simple language and transitions?

---

## Binary decision rule (balanced)

- **FAIL** if **A FAILS** (not grounded), OR **B HARD-FAILS** (genuinely hard to follow).
- Otherwise **PASS**.

This allows scripts that are “clear enough” even if they aren’t maximally story-driven.

---

## A) Groundedness (Anchors)

### PASS A if the script has **at least one ADEQUATE anchor**

(Strong anchors always pass. Adequate anchors pass even without a story.)

**STRONG anchors (always pass A):**

1. **Mini-scenario / story**
   - Has a character (you/someone) + action, ideally with a setting.
   - Example: “You’re in bed at 2am scrolling…”

2. **Specific example**
   - A concrete example that shows what the concept looks like in real life.
   - Example: “If you want to be healthier, you plan your meals on Sunday…”

**ADEQUATE anchors (pass A even without a story):**

3. **Concrete list (categories/tips)**
   - A list of **specific things** people can picture (careers, habits, meditation types, tactics, etc.).
   - **Passes even if it’s not a full story**, as long as items are concrete nouns.
   - Example: “Tech sales, IT support, digital marketing.”

4. **Action list (at least 2 clear actions)**
   - At least **two** visualizable instructions.
   - Example: “Put your phone in another room. Set a 25-minute timer.”

5. **Named entity / study with a practical takeaway**
   - Name-dropping alone is not enough, but it **doesn’t require** deep detail.
   - Must include one “what to do / what it means” line.
   - Example: “Huberman recommends 40Hz—so play it for 5 minutes before studying.”

6. **Analogy + one mapping line**
   - Analogy is OK if the script includes **one explicit translation**:
     “So in real life, that means \_\_\_ (an action, example, or concrete list item).”
   - Analogy-only with no mapping = **FAIL A**.

### FAIL A if:

- It’s mostly abstract (“be proactive,” “find your why,” “shift your mindset”) with **no scenario, no example, no concrete list, and fewer than 2 actions**.
- It uses frameworks/terms but never shows what it looks like in real life.

**Important calibration note:**  
A script does **not** need a full mini-story to pass A. A concrete list (like “top 3 careers” or “3 tips”) can pass A by itself.

---

## B) Delivery clarity (Flow)

### PASS B if:

- Mostly simple words, short-ish sentences
- Sounds conversational (not like a textbook)
- Uses basic connectors (“so,” “because,” “for example,” “here’s how”)
- One main thread (doesn’t bounce around)
- Viewer can paraphrase the point after one listen

### HARD-FAIL B only if one of these is true:

- **Jargon overload:** **3+** uncommon/technical terms **without** a quick plain-English gloss
  - (1–2 jargon terms is OK if the meaning is obvious from context.)
- **Confusing jumps:** multiple topic leaps without bridges (feels stitched together)
- **Overloaded sentences:** repeated long/stacked sentences that are hard to parse on one listen
- **Ambiguity:** lots of “this/that/it” and you can’t tell what it refers to

**Note:** Slight choppiness ≠ hard-fail. Only hard-fail if it would make a viewer scroll because they’re confused.

---

## Decision procedure

1. Write the core idea in one sentence.
2. Decide A (PASS if at least one adequate anchor exists).
3. Decide B (only hard-fail if genuinely difficult to follow).
4. Final:
   - FAIL if A FAIL or B HARD-FAIL
   - Else PASS

---

## Output format

Return **only** valid JSON. No markdown. No code fences.

If PASS:
{
"passed": true,
"critique": "1–3 sentences: why it’s clear. Mention the anchor(s) and why it’s easy enough on one listen.",
"suggestion": "",
"suggestion_reasoning": ""
}

If FAIL:
{
"passed": false,
"critique": "1–3 sentences: what makes it unclear (missing anchors and/or hard flow). Quote short phrases.",
"suggestion": "Concrete improvement: add one example OR add 2 specific actions OR add one mapping line for the analogy.",
"suggestion_reasoning": "Why this would make it understandable on one listen."
}
