#!/usr/bin/env node
import { tunnelmole } from "tunnelmole";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, "apps/web/.env");

const url = await tunnelmole({ port: 3000 });
const webhookUrl = `${url}/api/webhooks/remotion`;

let content;
try {
  content = readFileSync(envPath, "utf8");
} catch (e) {
  if (e.code === "ENOENT") {
    console.error("apps/web/.env not found. Create it first.");
    process.exit(1);
  }
  throw e;
}
if (content.match(/^\s*REMOTION_WEBHOOK_URL=/m)) {
  content = content.replace(/^\s*REMOTION_WEBHOOK_URL=.*$/gm, `REMOTION_WEBHOOK_URL=${webhookUrl}`);
} else {
  content += `\nREMOTION_WEBHOOK_URL=${webhookUrl}\n`;
}
writeFileSync(envPath, content);

console.log(`Tunnel: ${url} → localhost:3000`);
console.log(`Updated apps/web/.env: REMOTION_WEBHOOK_URL=${webhookUrl}`);
console.log("Restart the web app (pnpm web) to pick up the new URL.");
