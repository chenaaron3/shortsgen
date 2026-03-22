-- Add render_id for Remotion Lambda export progress polling
ALTER TABLE "shortgen_videos" ADD COLUMN IF NOT EXISTS "render_id" text;
