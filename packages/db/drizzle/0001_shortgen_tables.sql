-- Create shortgen_* tables (schema uses TABLE_PREFIX = "shortgen_")
CREATE TABLE IF NOT EXISTS "shortgen_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "shortgen_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortgen_account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "shortgen_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortgen_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortgen_verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "shortgen_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortgen_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"user_input" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortgen_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"s3_prefix" text,
	"source_text" text,
	"status" text DEFAULT 'preparing',
	"script" text,
	"chunks" text,
	"cache_key" text,
	"config_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortgen_account_userId_shortgen_user_id_fk') THEN
    ALTER TABLE "shortgen_account" ADD CONSTRAINT "shortgen_account_userId_shortgen_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."shortgen_user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shortgen_session_userId_shortgen_user_id_fk') THEN
    ALTER TABLE "shortgen_session" ADD CONSTRAINT "shortgen_session_userId_shortgen_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."shortgen_user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
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
