# Script Judge: Clarity

Evaluate a short-form script on **Clarity** as a **casual short-form viewer**.

**Question:** Is the core idea understandable and grounded in reality?

**PASS if:**

- **Specific Entity:** The script uses a named person, company, or event (e.g. "Steve Jobs", "Apple", "The 2008 crash").
- **Vivid Scenario:** The script describes a specific situation with sensory details (e.g. "You are sitting in a casino", "Your boss yells at you").
- **Hypothetical "You":** The script places the viewer in a specific situation (e.g. "Imagine you are building a house", "When you talk to a stranger").
- **Lists of Categories:** Lists of specific types/categories (e.g. "Nursing", "Sales", "Blue light") are concrete. **Do not** require specific company/brand names.
- **Generic Examples:** Examples involving generic people (e.g. "A baby learning to speak", "A runner training") are concrete.
- **Logical Unpacking:** The script explains a mechanism clearly (e.g. "Dopamine creates a craving").
- **Common Advice:** Simple advice like "remove distractions" is clear.

**FAIL if:**

- **Vague Generalizations:** The script only talks about "companies", "leaders", "people", or "success" in general terms without _any_ specific example, list, or scenario.
- **Pure Metaphors:** A metaphor ("life is a canvas") without a specific real-world application (e.g. "choosing a career").
- **Abstract Definitions:** The script defines terms ("What is love?") without applying them.
- **Textbook Style:** The script reads like an encyclopedia entry or summary (e.g. "The Law of Diffusion states that...").

**Decision Cue:**

1. **Check for Lists/Scenarios.** If the script lists specific categories (e.g. "IT jobs") or describes a generic scenario (e.g. "a baby learning"), **PASS**.
2. **Check for Pure Metaphors.** If the script uses a metaphor without a real-world application, **FAIL**.
3. **Check for Generalizations.** If the script _only_ talks about abstract groups ("leaders", "companies") without a specific entity or scenario, **FAIL**.
4. Otherwise, if it has a specific entity, vivid scenario, or logical unpacking, **PASS**.

---

## Few-Shot Examples

**PASS:**

- "Steve Jobs fired the guy... Apple lost its way" — Specific entity
- "Imagine you are at a casino... the house always wins" — Vivid scenario
- "Dopamine creates a craving... the brain seeks reward" — Logical unpacking
- "Remove distractions... turn off your phone" — Common advice (clear)
- "Nursing, Sales, and IT are high demand careers" — List of categories (concrete enough)
- "A baby learns to speak by listening... you should do the same" — Generic scenario (concrete enough)
- "Mindfulness breathing involves focusing on your breath... notice thoughts" — Instructional description (concrete)

**FAIL:**

- "Companies often lose their way when they grow. Leaders must rediscover their why." — (Generalization: no specific company or scenario)
- "The Golden Circle has three layers: What, How, and Why." — (Abstract definition)
- "Life is a blank canvas... paint your masterpiece." — (Pure metaphor)
- "Trust is built through consistency. Leaders should be consistent." — (Generalization)

---

## Output

Return **only** valid JSON.

If **PASS**:

```json
{
  "passed": true,
  "critique": "Brief rationale.",
  "suggestion": "",
  "suggestion_reasoning": ""
}
```

If **FAIL**:

```json
{
  "passed": false,
  "critique": "Brief rationale.",
  "suggestion": "Concrete improvement.",
  "suggestion_reasoning": "Why."
}
```
