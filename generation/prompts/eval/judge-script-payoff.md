# Script Judge: Payoff

Evaluate a short-form script on **Payoff** as a **casual short-form viewer**.

**Question:** Does the viewer get **SPECIFIC** value (concrete advice, insight, or understanding)?

**PASS if:**
- **Specific Action or Simple Directive:** The script tells the viewer to do something concrete (e.g., "turn off notifications", "just go out there and start talking to more people"). If the viewer can act on it, **PASS**.
- **Instructional:** The script describes *how* to do a practice (e.g., meditation steps, exercise form).
- **Mechanism/Insight:** The script explains *how* something works (e.g., "dopamine causes addiction", "the system is broken"). Understanding the mechanism *is* the payoff. Frameworks that help self-assess (e.g. ikigai's four areas) = insight = **PASS**.
- **Lists:** The script lists tips, ways, or items with some detail (e.g., "3 careers", "3 tips", "fix thought ratio, build social bonds"). Brief explanation per item = **PASS**. Do not require step-by-step for every item.
- **Story with Lesson:** The script tells a story that illustrates a principle (e.g., "LeBron throws chalk to get in the zone"). The lesson *is* the payoff.
- **Body-as-Payoff:** If the body delivers any of the above, **PASS**. **IGNORE THE CLOSE.** A weak close does not invalidate a good body.

**FAIL if:**
- **Vague Goals:** The script tells the viewer to achieve a state or goal without saying *how* (e.g., "be proactive", "find your why", "build trust", "be consistent"). These are **goals**, not **actions**.
- **Purely Abstract:** The script only defines terms (e.g., "What is love?") without any application or insight.
- **Story without Lesson:** A story that goes nowhere and teaches nothing.
- **Platitudes:** "Work harder", "Be yourself" (without any context or mechanism).

**Decision Cue:**
1. **Check for Vague Goals.** If the advice is "be X" or "find Y" (e.g. "be proactive", "find your why") without a specific step, **FAIL**.
2. **Check for Specific Actions or Simple Directives.** If the advice is "do X" (e.g. "write this down", "go talk to people", "just go out there and start talking"), **PASS**.
3. Otherwise, if it explains a mechanism or tells a story with a lesson, **PASS**.

---

## Few-Shot Examples

**PASS:**
- "The first tip is to use certain sounds... 40 Hz... The second tip is overt visual focus... stare for 30 seconds... The last tip... adrenaline... cold shower" — multiple specific tips
- "Salaries ranging from 100 to 300,000... forty to fifty thousand dollars entry level" — informational listicle
- "Caffeine before noon... blue light free bulbs... shower two hours before bed" — specific actionable steps
- "LeBron James throws chalk... it's a ritual... create your own ritual" — story with lesson/directive
- "The system is broken... increase income... take asymmetrical bets" — insight + steps
- "Focus on your breath... notice thoughts... bring attention back" — instructional steps
- "Just go out there and start talking to more people" — simple directive (actionable enough)

**FAIL:**
- Body: one Dale Carnegie parenting story. Close: "ask yourself: what do they truly want? Shift your pitch, not just your words" — (Vague directive: "shift your pitch" is not specific enough)
- Body defines What/How/Why only. Close: "start with your Why when setting goals" — (Vague goal: "start with why" is abstract)
- Close: "recognize someone's effort sincerely" or "build up that belief" — (Vague goal: "recognize effort" is abstract without a method)
- "Be proactive... take ownership... shape your life" — (Vague goals: "be proactive" is not an action)

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
