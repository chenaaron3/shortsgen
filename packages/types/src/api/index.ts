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
/** Structured output from chunker/feedback LLM (ChunksOutput in Python). */
export type ChunksOutput = z.infer<typeof chunksSchema>;

/** Breakdown phase loading messages (LLM-generated, stored in runs.breakdown_messages). */
export const breakdownMessagesSchema = z.array(z.string().min(1).max(60));
export type BreakdownMessages = z.infer<typeof breakdownMessagesSchema>;

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
    { message: "Provide imagery (direct) or feedback (LLM path)" },
  );
export type UpdateImageryRequest = z.infer<typeof updateImageryRequestSchema>;

// --- Response schemas (shared shape for async trigger endpoints) ---
const triggerResponseBaseSchema = z.object({
  jobId: z.string(),
  status: z.literal("started"),
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
/**
 * Progress event types emitted over WebSocket during pipeline execution.
 *
 * - breakdown_started: Run was just created; breakdown is starting.
 * - breakdown_completed: Source script for each video is determined. Slight gap before first video is created.
 * - video_started: A video record was created in the DB.
 * - script_created: Script generated and saved for a video. Display this in the UI.
 * - video_completed: Scenes generated for a video. Video transitions to scripts status.
 * - initial_processing_complete: All videos and scenes completed for the run.
 * - suggestion_partial: Streaming partial LLM suggestion (ChunksOutput JSON) while applying user feedback. Client can show tokens/diff optimistically.
 * - suggestion_completed: Full suggested chunks ready; client shows revision UI. DB chunks unchanged until user accepts.
 * - asset_gen_started: Asset generation (images, voice, captions) has started for a video.
 * - image_generated: Image generated for a scene (during asset_gen).
 * - voice_generated: Voice generated for a scene (during asset_gen).
 * - caption_generated: Captions generated (during asset_gen).
 * - asset_gen_completed: Asset generation done; video ready for export.
 * - error: Pipeline error.
 */
export const progressEventTypeSchema = z.enum([
  "breakdown_started",
  "breakdown_completed",
  "video_started",
  "script_created",
  "video_completed",
  "initial_processing_complete",
  "suggestion_partial",
  "suggestion_completed",
  "asset_gen_started",
  "image_generated",
  "voice_generated",
  "caption_generated",
  "asset_gen_completed",
  "error",
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
export const suggestionPartialPayloadSchema = z.object({
  /** Partial LLM output (raw tokens or partial JSON). */
  partial: z.string(),
});
export const suggestionCompletedPayloadSchema = z.object({
  chunks: chunksSchema,
});
export const assetGenCompletePayloadSchema = z.object({
  videoId: z.string(),
  s3Prefix: z.string(),
});
