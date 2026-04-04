/** Client-side check: single-line https URL (matches pipeline ingest heuristics). */
export function isSingleLineHttpsUrl(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("\n") || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}
