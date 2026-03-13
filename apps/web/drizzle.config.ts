import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/db/schema.ts",
  out: "../../packages/db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
