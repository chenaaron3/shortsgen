/**
 * Pipeline API schemas: requests, responses, WebSocket events.
 * Used by tRPC, Lambda handlers (via JSON), and frontend.
 */

import { z } from "zod";

// --- Nugget (from breakdown) ---
export const sourceRefSchema = z.object({
  chapter: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
});

export const nuggetSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_line: z.number(),
  end_line: z.number(),
  source_ref: sourceRefSchema.nullable().optional(),
  original_text: z.string().optional(),
  cache_key: z.string().optional(),
});

// --- Scene (from chunker) ---
export const sceneSchema = z.object({
  text: z.string(),
  imagery: z.string(),
  section: z.enum(["Hook", "Body", "Close"]),
  transition_from_previous: z.boolean().optional(),
  image_path: z.string().nullable().optional(),
  voice_path: z.string().nullable().optional(),
});

export const chunksSchema = z.object({
  scenes: z.array(sceneSchema),
  title: z.string().optional(),
  description: z.string().optional(),
});

// --- Request schemas ---
export const initialProcessingRequestSchema = z.object({
  runId: z.string().uuid(),
  sourceContent: z.string().min(1),
  config: z.string().optional().default("default"),
});
export type InitialProcessingRequest = z.infer<
  typeof initialProcessingRequestSchema
>;

export const updateClipFeedbackRequestSchema = z.object({
  runId: z.string().uuid(),
  videoId: z.string().uuid(),
  scriptFeedback: z.string().optional(),
  sceneFeedback: z
    .array(z.object({ sceneIndex: z.number(), feedback: z.string() }))
    .optional(),
});
export type UpdateClipFeedbackRequest = z.infer<
  typeof updateClipFeedbackRequestSchema
>;

export const finalizeClipRequestSchema = z.object({
  runId: z.string().uuid(),
  videoId: z.string().uuid(),
});
export type FinalizeClipRequest = z.infer<typeof finalizeClipRequestSchema>;

export const finalizeAllRequestSchema = z.object({
  runId: z.string().uuid(),
  videoIds: z.array(z.string().uuid()).min(1),
});
export type FinalizeAllRequest = z.infer<typeof finalizeAllRequestSchema>;

export const updateImageryRequestSchema = z
  .object({
    runId: z.string().uuid(),
    videoId: z.string().uuid(),
    sceneIndex: z.number().int().min(0),
    /** Direct path: use this text for image generation. */
    imagery: z.string().optional(),
    /** LLM path: like/dislike + reason to regenerate imagery via LLM. */
    liked: z.boolean().optional(),
    feedback: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.imagery !== undefined && data.imagery.trim().length > 0) ||
      data.feedback !== undefined,
    { message: "Provide imagery (direct) or feedback (LLM path)" }
  );
export type UpdateImageryRequest = z.infer<typeof updateImageryRequestSchema>;

// --- Response schemas (shared shape for async trigger endpoints) ---
const triggerResponseBaseSchema = z.object({
  jobId: z.string(),
  status: z.literal("started"),
  logsUrl: z.string().optional(),
});
export const initialProcessingResponseSchema = triggerResponseBaseSchema;
export const updateFeedbackResponseSchema = triggerResponseBaseSchema;
export const finalizeClipResponseSchema = triggerResponseBaseSchema;
export const finalizeAllResponseSchema = triggerResponseBaseSchema;
export const updateImageryResponseSchema = triggerResponseBaseSchema;
export type InitialProcessingResponse = z.infer<
  typeof initialProcessingResponseSchema
>;
export type UpdateFeedbackResponse = z.infer<
  typeof updateFeedbackResponseSchema
>;
export type FinalizeClipResponse = z.infer<typeof finalizeClipResponseSchema>;
export type FinalizeAllResponse = z.infer<typeof finalizeAllResponseSchema>;
export type UpdateImageryResponse = z.infer<typeof updateImageryResponseSchema>;

// --- WebSocket progress event types (shared with Python via types:sync) ---
export const progressEventTypeSchema = z.enum([
  "breakdown_started",
  "breakdown_complete",
  "clip_started",
  "clip_complete",
  "initial_processing_complete",
  "feedback_applied",
  "finalize_progress",
  "finalize_complete",
  "error",
  // Legacy
  "PROGRESS",
  "VIDEO_CREATED",
  "VIDEO_READY",
]);
export type ProgressEventType = z.infer<typeof progressEventTypeSchema>;

export const progressEventSchema = z.object({
  runId: z.string(),
  videoId: z.string(),
  type: progressEventTypeSchema,
  payload: z.unknown().optional(),
});

export type ProgressEvent = z.infer<typeof progressEventSchema>;

// Event type discriminators
export const breakdownCompletePayloadSchema = z.object({
  nuggets: z.array(nuggetSchema),
});
export const clipCompletePayloadSchema = z.object({
  videoId: z.string(),
  script: z.string(),
  chunks: chunksSchema,
});
export const feedbackAppliedPayloadSchema = z.object({
  chunks: chunksSchema,
});
export const finalizeCompletePayloadSchema = z.object({
  videoId: z.string(),
  s3Prefix: z.string(),
});
