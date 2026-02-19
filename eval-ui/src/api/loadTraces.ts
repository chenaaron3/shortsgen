import type { EvalTrace } from "../types";

export async function loadEvalDataset(): Promise<EvalTrace[]> {
  const res = await fetch("/eval-dataset.json");
  if (!res.ok) throw new Error("Failed to load eval dataset");
  return res.json();
}
