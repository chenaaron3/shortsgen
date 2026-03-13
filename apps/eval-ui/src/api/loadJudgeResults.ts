import type { JudgeResults } from "../types";

export async function loadJudgeResults(): Promise<JudgeResults | null> {
  try {
    const res = await fetch("/judge-results.json");
    if (!res.ok) return null;
    return (await res.json()) as JudgeResults;
  } catch {
    return null;
  }
}

/** Key for lookup: traceId::model (use "default" when model is null/empty) */
export function judgeResultKey(traceId: string, model: string): string {
  return model ? `${traceId}::${model}` : `${traceId}::default`;
}
