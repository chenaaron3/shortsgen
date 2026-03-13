/**
 * Shared manifest schema for Remotion videos.
 * Source of truth: Zod → JSON Schema → Pydantic (Python).
 * @see packages/schemas/manifest.schema.json (generated)
 * @see services/python-generator/scripts/schemas/video_manifest.py (generated)
 */

import { z } from "zod";

/** Word- or scene-level caption from Whisper transcription */
export const captionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});

/** Single scene: image, voice, duration */
export const sceneInputSchema = z.object({
  text: z.string(),
  imagePath: z.string(),
  voicePath: z.string(),
  durationInSeconds: z.number(),
  /** Image dimensions; when height > width (tall), scene uses full-bleed layout */
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
});

/** Remotion manifest: scenes, captions, metadata. Single source of truth; JSON Schema generated for Pydantic. */
export const manifestSchema = z.object({
  cacheKey: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationInFrames: z.number(),
  scenes: z.array(sceneInputSchema),
  captions: z.array(captionSchema),
});

export type Caption = z.infer<typeof captionSchema>;
export type SceneInput = z.infer<typeof sceneInputSchema>;
export type VideoManifest = z.infer<typeof manifestSchema>;
