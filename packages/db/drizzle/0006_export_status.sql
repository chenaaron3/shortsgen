-- Add export_path for cheap "is exported?" check. Video stored at {s3_prefix}short.mp4.
ALTER TABLE "shortgen_videos" ADD COLUMN IF NOT EXISTS "export_path" text;

-- Video status "export" is deprecated; migrate to "assets" (run keeps "export")
UPDATE "shortgen_videos" SET "status" = 'assets' WHERE "status" = 'export';
