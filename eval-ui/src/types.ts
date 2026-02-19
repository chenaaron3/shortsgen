export type EvalTrace = {
  id: string;
  nuggetId: string;
  title: string;
  rawContent: string;
  script: string;
  sourceRef?: string;
};

export type Dimension = "hook" | "body" | "ending";

export type Judgment = {
  dimension: Dimension;
  pass: boolean;
  critique: string;
};

export type Annotation = {
  traceId: string;
  judgments: Judgment[];
  notes?: string;
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
