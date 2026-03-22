/**
 * Derive step label and overall workflow progress from VideoProgress state.
 * - Label: server-driven via statusMessage (pass-through).
 * - Progress: client computes overall 0-1 by combining step index + current-step sub-progress.
 *   Server only conveys progress within the current step; this file aggregates across workflow steps.
 */

import type { ProgressEventType } from "@shortgen/types";

import type { VideoProgress } from "~/stores/useRunStore";

type WorkflowType = VideoProgress["workflow"];

/** Ordered steps per workflow. Last step is completion (we clear before showing). */
const WORKFLOW_STEPS: Record<WorkflowType, ProgressEventType[][]> = {
  initial_processing: [
    ["video_started"],
    ["script_created"],
    ["video_completed"],
  ],
  update_feedback: [
    ["request_sent"],
    ["suggestion_started"],
    ["suggestion_partial"],
    ["suggestion_completed"],
  ],
  update_imagery: [
    ["request_sent"],
    ["asset_gen_started"],
    ["asset_gen_progress"],
    ["asset_gen_completed"],
  ],
  finalize_clip: [
    ["request_sent"],
    ["asset_gen_started"],
    ["asset_gen_progress"],
    ["caption_generated"],
    ["asset_gen_completed"],
  ],
  export: [], // driven by Remotion poll; progress is already 0-1 overall
};

function getStepIndex(
  workflow: WorkflowType,
  type: ProgressEventType | undefined,
): number | undefined {
  const steps = WORKFLOW_STEPS[workflow];
  if (!steps?.length || !type) return undefined;
  const i = steps.findIndex((eventTypes) => eventTypes.includes(type));
  return i >= 0 ? i : undefined;
}

/** Sub-progress 0-1 within current step. Uses server progress when available. */
function getSubProgress(progress: VideoProgress): number {
  if (typeof progress.progress === "number") return progress.progress;
  return 0.5; // indeterminate when server doesn't send progress
}

export function getStepLabel(progress: VideoProgress | undefined): string {
  return progress?.statusMessage ?? "";
}

export function getProgressValue(progress: VideoProgress | undefined): number {
  if (!progress) return 0;

  const { workflow, type } = progress;

  if (workflow === "export") {
    return typeof progress.progress === "number" ? progress.progress : 0.5;
  }

  const steps = WORKFLOW_STEPS[workflow];
  if (!steps?.length) return 0;

  const stepIndex = getStepIndex(workflow, type);
  if (stepIndex === undefined) return 0;

  const isLastStep = stepIndex === steps.length - 1;
  if (isLastStep) return stepIndex / steps.length;

  const subProgress = getSubProgress(progress);
  const clamped = Math.min(1, Math.max(0, subProgress));
  return (stepIndex + clamped) / steps.length;
}
