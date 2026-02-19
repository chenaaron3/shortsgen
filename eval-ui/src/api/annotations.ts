import type { Annotation } from "../types";

const ANNOTATIONS_URL = "/api/annotations";

export type AnnotationSource = "human" | "llm";

export async function loadHumanAnnotations(): Promise<Record<string, Annotation>> {
  try {
    const res = await fetch(ANNOTATIONS_URL);
    if (!res.ok) return {};
    const list: Annotation[] = await res.json();
    return Object.fromEntries(list.map((a) => [a.traceId, a]));
  } catch {
    return {};
  }
}

export async function loadLLMAnnotations(): Promise<Record<string, Annotation>> {
  try {
    const res = await fetch("/llm-annotations.json");
    if (!res.ok) return {};
    const list: Annotation[] = await res.json();
    return Object.fromEntries(list.map((a) => [a.traceId, a]));
  } catch {
    return {};
  }
}

/** Merge human (overrides) with llm (defaults). Human always wins. */
export async function loadMergedAnnotations(): Promise<{
  annotations: Record<string, Annotation>;
  sources: Record<string, AnnotationSource>;
}> {
  const [human, llm] = await Promise.all([loadHumanAnnotations(), loadLLMAnnotations()]);
  const annotations: Record<string, Annotation> = {};
  const sources: Record<string, AnnotationSource> = {};
  const allIds = new Set([...Object.keys(human), ...Object.keys(llm)]);
  for (const id of allIds) {
    if (human[id]) {
      annotations[id] = human[id];
      sources[id] = "human";
    } else if (llm[id]) {
      annotations[id] = llm[id];
      sources[id] = "llm";
    }
  }
  return { annotations, sources };
}

export async function saveAnnotations(
  humanAnnotations: Record<string, Annotation>
): Promise<void> {
  const list = Object.values(humanAnnotations);
  const res = await fetch(ANNOTATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list),
  });
  if (!res.ok) throw new Error("Failed to save annotations");
}
