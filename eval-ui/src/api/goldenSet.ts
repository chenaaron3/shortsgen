/** Golden set entry format (used by validate_judges) */
export type GoldenSetEntry = {
  traceId: string;
  model: string | null;
  title: string;
  rawContent: string;
  script: string;
  expected: Record<string, boolean>;
};

export async function loadGoldenSet(): Promise<GoldenSetEntry[]> {
  try {
    const res = await fetch("/api/golden-set");
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as GoldenSetEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addToGoldenSet(entry: GoldenSetEntry): Promise<void> {
  const res = await fetch("/api/golden-set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to add to golden set");
  }
}

export async function removeFromGoldenSet(traceId: string, model: string): Promise<void> {
  const params = new URLSearchParams({ traceId, model });
  const res = await fetch(`/api/golden-set?${params}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to remove from golden set");
  }
}
