import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    DATABASE_URL: z.string().url(),
    SHORTGEN_API_URL: z.string().url(),
    SHORTGEN_API_SECRET: z.string().min(1),
    SHORTGEN_BUCKET_NAME: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** Comma-separated emails allowed for admin features (e.g. run logs viewer). */
    ADMIN_EMAILS: z.string().optional(),
    /** OpenAI API key for breakdown message generation. Optional; falls back to static messages if unset. */
    OPENAI_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_SHORTGEN_WS_URL: z.string().url(),
    NEXT_PUBLIC_REMOTION_SERVE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    SHORTGEN_API_URL: process.env.SHORTGEN_API_URL,
    SHORTGEN_API_SECRET: process.env.SHORTGEN_API_SECRET,
    SHORTGEN_BUCKET_NAME: process.env.SHORTGEN_BUCKET_NAME,
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_SHORTGEN_WS_URL: process.env.NEXT_PUBLIC_SHORTGEN_WS_URL,
    NEXT_PUBLIC_REMOTION_SERVE_URL: process.env.NEXT_PUBLIC_REMOTION_SERVE_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
