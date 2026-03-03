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
  /** youtube = Improvement Pill etc; ai = pipeline-generated. Drives holdout expected labels. */
  sourceType?: "youtube" | "ai";
  /** Creation time (ms since epoch). Used for sorting (newer first). */
  createdAt?: number;
};

export type Dimension = "engagement" | "clarity" | "payoff";

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
  /** When true, this annotation is in the golden set (used by validate_judges). */
  is_golden?: boolean;
};

export const DIMENSIONS: Dimension[] = ["engagement", "clarity", "payoff"];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  engagement: "Engagement",
  clarity: "Clarity",
  payoff: "Payoff",
};

export const DIMENSION_QUESTIONS: Record<Dimension, string> = {
  engagement: "Would a viewer keep watching?",
  clarity: "Is the core idea understandable in one pass?",
  payoff: "Does the viewer get something concrete?",
};

/** Per-dimension agreement stats (from validate_judges) */
export type JudgeDatasetStats = Record<
  Dimension,
  { agree: number; disagree: number }
>;

/** Judge result for one trace+model (from validate_judges) */
export type JudgeResultEntry = {
  traceId: string;
  model: string | null;
  title?: string;
  /** golden = starred/human labels; holdout = non-starred, YouTube=pass AI=fail */
  dataset?: "golden" | "holdout";
  expected: Record<Dimension, boolean>;
  predicted: Record<Dimension, boolean>;
  critiques: Record<Dimension, string>;
  /** Suggested improvement per dimension (from judge) */
  suggestions?: Record<Dimension, string>;
  /** Reasoning for why the suggestion is better */
  suggestionReasons?: Record<Dimension, string>;
  disagreements: Dimension[];
};

export type JudgeResults = {
  generatedAt: string;
  model?: string;
  /** Per-dimension agreement for golden set (when validate_judges ran on both) */
  golden?: JudgeDatasetStats;
  /** Per-dimension agreement for holdout set */
  holdout?: JudgeDatasetStats;
  entries: JudgeResultEntry[];
};
