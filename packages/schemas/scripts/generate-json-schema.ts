#!/usr/bin/env npx tsx
/**
 * Generate manifest.schema.json from Zod for Pydantic codegen.
 * Run: pnpm --filter @shortgen/schemas build
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { manifestSchema } from "../manifest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "..", "manifest.schema.json");

const jsonSchema = zodToJsonSchema(manifestSchema, "VideoManifest", {
  $refStrategy: "none",
});

writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2), "utf-8");
console.log(`Wrote ${outputPath}`);
