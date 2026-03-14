#!/usr/bin/env npx tsx
/**
 * Generate JSON Schema from Zod for each domain. Used by types:sync for Pydantic codegen.
 * Run: pnpm --filter @shortgen/types build
 */
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { manifestSchema } from "../src/manifest";
import { chunksSchema, nuggetSchema, progressEventTypeSchema } from "../src/api";
import { runSchema, videoSchema } from "../src/table";

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = join(__dirname, "..", "generated");
mkdirSync(generatedDir, { recursive: true });

// Manifest
const manifestJson = zodToJsonSchema(manifestSchema, {
  name: "VideoManifest",
  $refStrategy: "none",
});
writeFileSync(
  join(generatedDir, "manifest.schema.json"),
  JSON.stringify(manifestJson, null, 2),
  "utf-8"
);
console.log("Wrote generated/manifest.schema.json");

// API: wrapper so both Chunks and Nugget (with nested types) are generated
const apiRootSchema = z.object({
  chunks: chunksSchema.optional(),
  nugget: nuggetSchema.optional(),
});
const apiJson = zodToJsonSchema(apiRootSchema, {
  name: "ApiSchemas",
  $refStrategy: "none",
});
writeFileSync(
  join(generatedDir, "api.schema.json"),
  JSON.stringify(apiJson, null, 2),
  "utf-8"
);
console.log("Wrote generated/api.schema.json");

// Table: wrapper so both Run and Video are generated
const tableRootSchema = z.object({
  run: runSchema.optional(),
  video: videoSchema.optional(),
});
const tableJson = zodToJsonSchema(tableRootSchema, {
  name: "TableSchemas",
  $refStrategy: "none",
});
writeFileSync(
  join(generatedDir, "table.schema.json"),
  JSON.stringify(tableJson, null, 2),
  "utf-8"
);
console.log("Wrote generated/table.schema.json");

// Progress event type enum (shared TypeScript + Python)
const progressEventTypeJson = zodToJsonSchema(progressEventTypeSchema, {
  name: "ProgressEventType",
  $refStrategy: "none",
});
writeFileSync(
  join(generatedDir, "progress-event-type.schema.json"),
  JSON.stringify(progressEventTypeJson, null, 2),
  "utf-8"
);
console.log("Wrote generated/progress-event-type.schema.json");
