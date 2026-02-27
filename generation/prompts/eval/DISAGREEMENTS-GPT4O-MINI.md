# gpt-4o-mini Judge Disagreement Analysis

**Agreement:** engagement 41% | clarity 62% | payoff 72%  
**21 entries** with ≥1 disagreement (32 total golden entries)

---

## 1. Engagement: Judge STRICTER (9 cases)

Human PASS, judge FAIL. Judge rejects scripts humans found engaging.

| # | Title | Model | Judge's reason |
|---|-------|-------|-----------------|
| 1 | Be Proactive: Own Your Choices | mixed | "Lacks strong open loop; states what will be shown without urgency" |
| 2 | Proactivity as a Blank Canvas | claude-sonnet | "Lacks strong open loop; 'what it actually means' and 'why most people get it wrong' don't create enough tension" |
| 3 | Principle of Ownership | mixed | "Meta-intro that lacks compelling twist; 'difference between proactive and reactive' feels generic" |
| 4 | Feelings of Inferiority Can Drive Growth | claude-sonnet | "Generic statement about feelings of inferiority; no specific open loop" |
| 5 | Separate Your Tasks from Others' Tasks | claude-sonnet | "Direct but lacks open loop; could use twist like 'and why most fail'" |
| 6 | Build Horizontal, Not Vertical Relationships | claude-sonnet | "Interesting idea but lacks urgency; 'you're not free' could go further" |
| 7 | Community Feeling: The Goal of Relationships | claude-sonnet | "Feels like statement not compelling question; no urgency" |
| 8 | You Can Change: Lifestyle is a Choice | claude-sonnet | "Interesting idea but lacks strong open loop or urgency" |
| 9 | source (enough / goalpost) | default | "Question 'how can we stop that?' is soft, no specific open loop" |

**Pattern:** Judge penalizes hooks that humans find acceptable when they: (a) use meta-intro phrasing, (b) are "interesting but not urgent," or (c) ask soft questions. Several hooks like "Today I want to show you X—and why most people get it wrong" get failed despite creating curiosity.

---

## 2. Engagement: Judge LENIENT (10 cases)

Human FAIL, judge PASS. Judge passes scripts humans found dull or confusing.

| # | Title | Model |
|---|-------|-------|
| 1 | Teleology vs Aetiology: Goals over Causes | claude-sonnet |
| 2 | Don't Get Drawn into Power Struggles | claude-sonnet |
| 3–7 | source (internal triggers / habit-forming products) | mixed, claude-sonnet, default (5 variants) |
| 8 | The Power of a Smile | mixed |
| 9 | The Importance of Names | mixed |

**Pattern:** Niche content (Adlerian psychology, habit-forming products) and social-skills scripts. Humans may fail for audience fit ("who cares about habit-forming products?") or relatability. Judge evaluates structure and finds open loops/curiosity where humans don't.

---

## 3. Clarity: Judge STRICTER (2 cases)

Human PASS, judge FAIL.

| # | Title | Judge's reason |
|---|-------|----------------|
| 1 | Community Feeling: The Goal of Relationships | "Multiple ideas—self-acceptance, confidence, contribution—without single unifying thread; 'confidence' vs 'trust' explanation adds confusion" |
| 2 | Happiness is the Feeling of Contribution | "Core idea muddled; tangents (self-sacrifice, subjective measurement); multiple concepts without clear structure" |

**Pattern:** Judge flags scripts with three-part frameworks (self-acceptance, confidence, contribution) as "multiple ideas competing." Humans may find the structure coherent.

---

## 4. Clarity: Judge LENIENT (10 cases)

Human FAIL, judge PASS. Judge finds scripts clear when humans found them confusing.

Includes: Teleology vs Aetiology, Don't Get Drawn into Power Struggles, internal-triggers "source" scripts (4), Criticism Doesn't Work, The Power of a Smile, The Importance of Names.

**Pattern:** Same as engagement lenient—niche/jargon content. Judge understands Adlerian terms, product-design concepts; humans may not follow in one pass.

---

## 5. Payoff: Judge STRICTER (0 cases in this run)

No cases where human PASS and judge FAIL. (Variance across runs.)

---

## 6. Payoff: Judge LENIENT (7–9 cases)

Human FAIL, judge PASS.

Includes: Proactivity as a Blank Canvas (claude-sonnet), Teleology vs Aetiology, Build Horizontal, Don't Get Drawn into Power Struggles, internal-triggers "source" scripts (4–5).

**Pattern:** Judge accepts rhetorical questions, "try X instead" suggestions, or abstract direction as actionable. Humans want more concrete steps.

---

## 7. Highest-Conflict Entries (2+ dimensions)

| Title | Model | Disagreements |
|-------|-------|---------------|
| Teleology vs Aetiology: Goals over Causes | claude-sonnet | engagement, clarity, payoff |
| Don't Get Drawn into Power Struggles | claude-sonnet | engagement, clarity, payoff |
| source (internal triggers) | mixed, claude-sonnet | engagement, clarity, payoff (4 variants) |
| Proactivity as a Blank Canvas | claude-sonnet | engagement, payoff |
| Build Horizontal, Not Vertical Relationships | claude-sonnet | engagement, payoff |

---

## 8. Summary & Next Steps

| Dimension | Main issue |
|-----------|------------|
| **Engagement** | Judge too strict on meta-intros and "interesting but not urgent" hooks; too lenient on niche/Adlerian content |
| **Clarity** | Judge stricter on multi-part frameworks; lenient on jargon/niche content |
| **Payoff** | Judge lenient—accepts vague/rhetorical endings human fails |

**Prompts to try:**
- Engagement: "Evaluate as a casual short-form viewer. If the full hook creates curiosity (e.g. 'X—and why most people get it wrong'), don't auto-fail for meta-intro phrasing alone."
- Engagement: "Niche topics (Adlerian psychology, product design) need an especially relatable angle to pass. Jargon without quick unpacking can fail even if structure is sound."
- Clarity: "A three-part framework (A, B, C) can pass if there's one unifying idea. Don't fail for multiple components when they build one core point."
- Payoff: "'Try X instead' or a rhetorical question alone is not actionable. Require one concrete step (when/where/how) or a named mechanism."
