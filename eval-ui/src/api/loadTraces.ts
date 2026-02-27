import type { EvalTrace } from "../types";

function normalizeScript(script: unknown): Record<string, string> {
  if (typeof script === "string") return { default: script };
  if (script && typeof script === "object" && !Array.isArray(script)) {
    return script as Record<string, string>;
  }
  return {};
}

export async function loadEvalDataset(): Promise<EvalTrace[]> {
  const res = await fetch("/eval-dataset.json");
  if (!res.ok) throw new Error("Failed to load eval dataset");
  const raw: unknown[] = await res.json();
  const traces = raw.map((t: Record<string, unknown>) => ({
    ...t,
    script: normalizeScript(t.script),
    assets: (t.assets as Record<string, string> | undefined) ?? undefined,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : undefined,
  })) as EvalTrace[];
  traces.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return traces;
}

export async function deleteTrace(traceId: string): Promise<void> {
  const res = await fetch(`/api/eval-dataset/${traceId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to delete trace");
  }
}
