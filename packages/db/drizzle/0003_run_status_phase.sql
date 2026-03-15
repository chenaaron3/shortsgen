-- Run status: pending|processing|completed|failed -> breakdown|scripting|asset_gen|export|failed
-- Migrate existing: pending/processing -> breakdown, completed -> export, failed -> failed
UPDATE "shortgen_runs"
SET "status" = CASE
  WHEN "status" IN ('pending', 'processing') THEN 'breakdown'
  WHEN "status" = 'completed' THEN 'export'
  WHEN "status" = 'failed' THEN 'failed'
  ELSE 'breakdown'
END
WHERE "status" NOT IN ('breakdown', 'scripting', 'asset_gen', 'export', 'failed');
--> statement-breakpoint
ALTER TABLE "shortgen_runs" ALTER COLUMN "status" SET DEFAULT 'breakdown';
