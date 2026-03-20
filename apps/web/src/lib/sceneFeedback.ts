export type SceneSentiment = "like" | "dislike" | null;

export interface SceneFeedback {
  sentiment: SceneSentiment;
  note: string;
}

/** Stable default for selectors (e.g. Zustand) when a scene has no feedback yet. */
export const EMPTY_SCENE_FEEDBACK: SceneFeedback = {
  sentiment: null,
  note: "",
};

export const emptySceneFeedback = (): SceneFeedback => ({
  sentiment: null,
  note: "",
});

/** Serialize for update-feedback API (unchanged wire format for the pipeline). */
export function sceneFeedbackToApiString(f: SceneFeedback): string {
  const t = f.note.trim();
  if (f.sentiment === null) return "";
  if (f.sentiment === "like") {
    return t ? `Looks good: ${t}` : "Looks good";
  }
  return t ? `Dislike: ${t}` : "Dislike";
}
