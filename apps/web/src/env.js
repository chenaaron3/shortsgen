import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_SECRET: z.string().min(1),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    DATABASE_URL: z.string().url(),
    SHORTGEN_API_URL: z.string().url(),
    SHORTGEN_API_SECRET: z.string().min(1),
    SHORTGEN_BUCKET_NAME: z.string().min(1),
    SHORTGEN_CDN_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** Comma-separated emails for admin features (e.g. run logs viewer). */
    ADMIN_EMAILS: z.string().min(1),
    /** OpenAI API key for breakdown message generation. */
    OPENAI_API_KEY: z.string().min(1),
    /** Remotion Lambda: function name from `npx remotion lambda functions deploy` */
    REMOTION_LAMBDA_FUNCTION_NAME: z.string().min(1),
    /** Remotion Lambda: region (e.g. us-east-1) */
    REMOTION_LAMBDA_REGION: z.string().min(1),
    /** Remotion Lambda: serve URL from `npx remotion lambda sites create` */
    REMOTION_LAMBDA_SERVE_URL: z.string().url(),
    /** Webhook URL for Remotion Lambda completion (must be reachable from AWS) */
    REMOTION_WEBHOOK_URL: z.string().url(),
    /** Webhook secret for validating Remotion callbacks */
    REMOTION_WEBHOOK_SECRET: z.string().min(1),
    /** Stripe (optional - billing disabled when not set) */
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_BASIC: z.string().min(1).optional(),
    STRIPE_PRICE_PRO: z.string().min(1).optional(),
    STRIPE_PRICE_BUSINESS: z.string().min(1).optional(),
    STRIPE_PRICE_CREDITS_100: z.string().min(1).optional(),
    /** Supadata API key for URL source extraction (transcript/crawl). */
    SUPADATA_API_KEY: z.string().min(1).optional(),
    /** Optional Supadata base URL override. */
    SUPADATA_BASE_URL: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_SHORTGEN_WS_URL: z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    SHORTGEN_API_URL: process.env.SHORTGEN_API_URL,
    SHORTGEN_API_SECRET: process.env.SHORTGEN_API_SECRET,
    SHORTGEN_BUCKET_NAME: process.env.SHORTGEN_BUCKET_NAME,
    SHORTGEN_CDN_URL: process.env.SHORTGEN_CDN_URL,
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    REMOTION_LAMBDA_FUNCTION_NAME: process.env.REMOTION_LAMBDA_FUNCTION_NAME,
    REMOTION_LAMBDA_REGION: process.env.REMOTION_LAMBDA_REGION,
    REMOTION_LAMBDA_SERVE_URL: process.env.REMOTION_LAMBDA_SERVE_URL,
    REMOTION_WEBHOOK_URL: process.env.REMOTION_WEBHOOK_URL,
    REMOTION_WEBHOOK_SECRET: process.env.REMOTION_WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_BASIC: process.env.STRIPE_PRICE_BASIC,
    STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
    STRIPE_PRICE_BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
    STRIPE_PRICE_CREDITS_100: process.env.STRIPE_PRICE_CREDITS_100,
    SUPADATA_API_KEY: process.env.SUPADATA_API_KEY,
    SUPADATA_BASE_URL: process.env.SUPADATA_BASE_URL,
    NEXT_PUBLIC_SHORTGEN_WS_URL: process.env.NEXT_PUBLIC_SHORTGEN_WS_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
