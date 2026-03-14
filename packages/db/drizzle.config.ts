import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load DATABASE_URL from apps/web/.env when not set (e.g. running db:push from project root)
if (!process.env.DATABASE_URL) {
  let configDir: string;
  try {
    configDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    configDir = process.cwd(); // drizzle-kit may run in CJS where import.meta is unavailable
  }
  config({ path: resolve(configDir, "../../apps/web/.env") });
}

export default defineConfig({
  schema: "./schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Only manage shortgen tables; ignore other projects (daycare, jawline, etc.) in shared DB
  tablesFilter: ["shortgen_*"],
});
