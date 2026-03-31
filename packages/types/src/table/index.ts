/**
 * DB table schemas (runs, videos, brand). Re-exported from @shortgen/db (drizzle-zod).
 * Used for API validation and Python Pydantic codegen via types:sync.
 */

export {
  runSchema,
  videoSchema,
  brandSchema,
  type Run,
  type Video,
  type Brand,
} from "@shortgen/db";
