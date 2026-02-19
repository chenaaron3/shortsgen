/** Parse [HOOK], [BODY], [CLOSE] sections from script.md content */
export function parseScript(script: string): { hook: string; body: string; close: string } {
  const stripped = script.replace(/^```\s*\n?|\n?```\s*$/g, "").trim();
  const hookMatch = stripped.match(/\[HOOK\]\s*\n?([\s\S]*?)(?=\[BODY\]|$)/i);
  const bodyMatch = stripped.match(/\[BODY\]\s*\n?([\s\S]*?)(?=\[CLOSE\]|$)/i);
  const closeMatch = stripped.match(/\[CLOSE\]\s*\n?([\s\S]*?)$/i);

  return {
    hook: (hookMatch?.[1] ?? "").trim(),
    body: (bodyMatch?.[1] ?? "").trim(),
    close: (closeMatch?.[1] ?? "").trim(),
  };
}
