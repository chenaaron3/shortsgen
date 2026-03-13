#!/usr/bin/env node
/**
 * Generate manifest.schema.json from Zod schema.
 * Run: pnpm schemas:build (from packages/schemas)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { manifestSchema } from "../manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "manifest.schema.json");

const jsonSchema = zodToJsonSchema(manifestSchema, {
  name: "VideoManifest",
  $refStrategy: "seen",
});

writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2), "utf-8");
console.log("Wrote", outPath);
