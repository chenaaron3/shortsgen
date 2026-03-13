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
    TRIGGER_RUN_URL: z.string().url().optional(),
    SHORTGEN_BUCKET_NAME: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_SHORTGEN_WS_URL: z.string().url().optional(),
    NEXT_PUBLIC_REMOTION_SERVE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    TRIGGER_RUN_URL: process.env.TRIGGER_RUN_URL,
    SHORTGEN_BUCKET_NAME: process.env.SHORTGEN_BUCKET_NAME,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SHORTGEN_WS_URL: process.env.NEXT_PUBLIC_SHORTGEN_WS_URL,
    NEXT_PUBLIC_REMOTION_SERVE_URL: process.env.NEXT_PUBLIC_REMOTION_SERVE_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
