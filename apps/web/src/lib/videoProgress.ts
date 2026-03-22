/**
 * Derive step label and progress 0-1 from VideoProgress state.
 * Progress = (stepIndex + subProgress) / totalSteps, with continuous values clamped into current step.
 */

import type { ProgressEventType } from "@shortgen/types";

import type { VideoProgress } from "~/stores/useRunStore";

type WorkflowType = VideoProgress["workflow"];

interface StepDef {
  /** Event type(s) that indicate we're in this step. */
  event: ProgressEventType | ProgressEventType[];
  /** Human label for this step. */
  label: string;
  /** Optional: get 0-1 sub-progress from state (e.g. estimatedProgress, imagesDone/voiceDone). */
  getSubProgress?: (state: VideoProgress) => number;
}

/** Ordered steps per workflow. Last step is typically completion (we clear before showing). */
const WORKFLOW_STEPS: Record<WorkflowType, StepDef[]> = {
  initial_processing: [
    { event: "video_started", label: "Script…" },
    { event: "script_created", label: "Scenes…" },
    { event: "video_completed", label: "" }, // done
  ],
  update_feedback: [
    { event: "suggestion_started", label: "Applying feedback…" },
    {
      event: "suggestion_partial",
      label: "Streaming…",
      getSubProgress: (s) => (typeof s.progress === "number" ? s.progress : 0),
    },
    { event: "suggestion_completed", label: "" }, // done
  ],
  update_imagery: [
    {
      event: "asset_gen_started",
      label: "Regenerating image…",
      getSubProgress: () => 0.5, // indeterminate between start and done
    },
    { event: "asset_gen_completed", label: "" }, // done
  ],
  finalize_clip: [
    {
      event: ["asset_gen_started", "image_generated", "voice_generated"],
      label: "Assets", // overridden in getStepLabel for N/M display
      getSubProgress: (s) => {
        const n = s.totalScenes ?? 1;
        const im = s.imagesDone ?? 0;
        const vo = s.voiceDone ?? 0;
        return (im + vo) / (2 * n);
      },
    },
    {
      event: "caption_generated",
      label: "Captions…",
      getSubProgress: () => 0.5, // indeterminate
    },
    { event: "asset_gen_completed", label: "" }, // done
  ],
  export: [], // driven by Remotion poll, not WS steps
};

function getStepIndex(
  workflow: WorkflowType,
  step: string | undefined,
): number | undefined {
  const steps = WORKFLOW_STEPS[workflow];
  if (!steps || !step) return undefined;
  const i = steps.findIndex((s) => {
    const events = Array.isArray(s.event) ? s.event : [s.event];
    return events.includes(step as ProgressEventType);
  });
  return i >= 0 ? i : undefined;
}

function getStepDef(
  workflow: WorkflowType,
  stepIndex: number,
): StepDef | undefined {
  return WORKFLOW_STEPS[workflow]?.[stepIndex];
}

export function getStepLabel(progress: VideoProgress | undefined): string {
  if (!progress) return "";
  const { workflow, step } = progress;
  if (step === "request_sent") return "Starting…";

  if (workflow === "export") {
    const p = progress.progress;
    if (typeof p === "number" && p > 0 && p < 1)
      return `Rendering ${Math.round(p * 100)}%`;
    return "Rendering…";
  }

  const idx = getStepIndex(workflow, step);
  if (idx === undefined) return "Processing…";

  const def = getStepDef(workflow, idx);
  if (!def || def.label === "") return "";

  // Custom label for finalize_clip assets phase
  if (
    workflow === "finalize_clip" &&
    (step === "image_generated" ||
      step === "voice_generated" ||
      step === "asset_gen_started")
  ) {
    const im = progress.imagesDone ?? 0;
    const vo = progress.voiceDone ?? 0;
    const n = progress.totalScenes ?? 1;
    return `Images ${im}/${n}, Voice ${vo}/${n}`;
  }

  return def.label;
}

export function getProgressValue(progress: VideoProgress | undefined): number {
  if (!progress) return 0;
  const { workflow, step, progress: p } = progress;

  if (step === "request_sent") return 0.05;
  if (workflow === "export")
    return typeof p === "number" ? p : 0.5;

  const steps = WORKFLOW_STEPS[workflow];
  if (!steps?.length) return 0;

  const stepIndex = getStepIndex(workflow, step);
  if (stepIndex === undefined) return 0;

  const def = getStepDef(workflow, stepIndex);
  if (!def || stepIndex === steps.length - 1) return stepIndex / steps.length;

  const subProgress = def.getSubProgress?.(progress) ?? 0;
  const clamped = Math.min(1, Math.max(0, subProgress));
  return (stepIndex + clamped) / steps.length;
}
