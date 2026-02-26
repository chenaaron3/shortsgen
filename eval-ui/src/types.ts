export type EvalTrace = {
  id: string;
  nuggetId: string;
  title: string;
  rawContent: string;
  /** Map of config name -> script text. Enables comparing multiple configs for same content. */
  script: Record<string, string>;
  /** Map of config name -> config hash. When present, chunks/images/video exist at eval-assets/{id}/{hash}/ */
  assets?: Record<string, string>;
  sourceRef?: string;
  /** Creation time (ms since epoch). Used for sorting (newer first). */
  createdAt?: number;
};

export type Dimension = "hook" | "body" | "ending";

export type Judgment = {
  dimension: Dimension;
  pass: boolean;
  critique: string;
};

export type ImageAnnotation = {
  sceneIndex: number;
  marker: "good" | "bad";
  /** Common issue from dropdown, prepended to note when present. */
  commonIssue?: string;
  /** Required when marker is "bad" (commonIssue or note). */
  note?: string;
};

export const COMMON_IMAGE_ISSUES = [
  "Irrelevant to text",
  "Cluttered",
  "Unnatural image",
  "Other",
] as const;

export type Annotation = {
  traceId: string;
  /** Config name (e.g. "claude-sonnet", "gpt-4o"). Enables per-config annotations. */
  model?: string;
  judgments: Judgment[];
  notes?: string;
  /** Per-image good/bad markers. Bad images require a note. */
  imageAnnotations?: ImageAnnotation[];
  reviewedAt: string;
};

export const DIMENSIONS: Dimension[] = ["hook", "body", "ending"];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  hook: "Hook",
  body: "Body",
  ending: "Ending",
};

export const DIMENSION_QUESTIONS: Record<Dimension, string> = {
  hook: "Does it capture the user's attention?",
  body: "Does it provide value?",
  ending: "Does it close the loop and make the user feel like they learned something?",
};
