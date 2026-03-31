-- Append-only brand rows per user; videos reference the brand used for visuals
CREATE TABLE IF NOT EXISTS "shortgen_brand" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL REFERENCES "shortgen_user"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  "style_prompt" text,
  "mascot_description" text,
  "avatar_s3_key" text
);

CREATE INDEX IF NOT EXISTS "shortgen_brand_userId_created_at_idx" ON "shortgen_brand" ("userId", "created_at" DESC);

ALTER TABLE "shortgen_videos" ADD COLUMN IF NOT EXISTS "brand_id" uuid REFERENCES "shortgen_brand"("id") ON DELETE SET NULL;
