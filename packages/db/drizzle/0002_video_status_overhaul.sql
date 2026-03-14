-- Drop runs and videos (drop DB and reapply with new status enum)
DROP TABLE IF EXISTS "shortgen_videos" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "shortgen_runs" CASCADE;
--> statement-breakpoint
CREATE TABLE "shortgen_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"user_input" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shortgen_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"s3_prefix" text,
	"source_text" text,
	"status" text DEFAULT 'created',
	"script" text,
	"chunks" text,
	"cache_key" text,
	"config_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortgen_runs_userId_shortgen_user_id_fk') THEN
    ALTER TABLE "shortgen_runs" ADD CONSTRAINT "shortgen_runs_userId_shortgen_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."shortgen_user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortgen_videos_run_id_shortgen_runs_id_fk') THEN
    ALTER TABLE "shortgen_videos" ADD CONSTRAINT "shortgen_videos_run_id_shortgen_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."shortgen_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
