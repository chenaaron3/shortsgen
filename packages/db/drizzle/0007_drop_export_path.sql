-- Remove export_path; export URL derived from s3_prefix + short.mp4 when status = exported
ALTER TABLE "shortgen_videos" DROP COLUMN IF EXISTS "export_path";
