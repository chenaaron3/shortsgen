import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";

import { appRouterWebhook } from "@remotion/lambda/client";
import { runs, videos } from "@shortgen/db";

const ENABLE_TESTING = false;

async function onSuccess(payload: {
  renderId: string;
  customData: { runId?: string; videoId?: string } | null;
  outputFile?: string;
}) {
  console.log(
    `[remotion-webhook] success renderId=${payload.renderId} customData=${JSON.stringify(payload.customData)}`,
  );

  const { runId, videoId } = payload.customData ?? {};
  if (!runId || !videoId) {
    console.warn("[remotion-webhook] success missing customData", payload);
    return;
  }

  const exportPath = payload.outputFile ?? null;
  await db
    .update(videos)
    .set({
      status: "exported",
      ...(exportPath != null && { export_path: exportPath }),
    })
    .where(and(eq(videos.id, videoId), eq(videos.run_id, runId)));

  // Run stays "export"; no run-level status change when videos complete
  console.log(
    `[remotion-webhook] video ${videoId} exported, path=${exportPath ?? "n/a"}`,
  );
}

async function onError(payload: {
  renderId: string;
  customData: { runId?: string; videoId?: string } | null;
  errors?: { message: string; name: string; stack?: string }[];
}) {
  console.error(
    `[remotion-webhook] error renderId=${payload.renderId} customData=${JSON.stringify(payload.customData)} errors=${JSON.stringify(payload.errors?.map((e) => ({ name: e.name, message: e.message })))}`,
  );

  const { runId, videoId } = payload.customData ?? {};
  if (!runId || !videoId) {
    console.warn("[remotion-webhook] error missing customData", payload);
    return;
  }

  const errMessages =
    payload.errors?.map((e) => `${e.name}: ${e.message}`).join("; ") ??
    "unknown";
  console.error(
    `[remotion-webhook] video ${videoId} render failed: ${errMessages}`,
  );

  await db
    .update(videos)
    .set({ status: "assets" })
    .where(and(eq(videos.id, videoId), eq(videos.run_id, runId)));
}

async function onTimeout(payload: {
  renderId: string;
  customData: { runId?: string; videoId?: string } | null;
}) {
  console.error(
    `[remotion-webhook] timeout renderId=${payload.renderId} customData=${JSON.stringify(payload.customData)}`,
  );

  const { runId, videoId } = payload.customData ?? {};
  if (!runId || !videoId) {
    console.warn("[remotion-webhook] timeout missing customData", payload);
    return;
  }

  await db
    .update(videos)
    .set({ status: "failed" })
    .where(and(eq(videos.id, videoId), eq(videos.run_id, runId)));

  console.error(`[remotion-webhook] video ${videoId} render timed out`);
}

const baseHandler = appRouterWebhook({
  secret: env.REMOTION_WEBHOOK_SECRET,
  testing: ENABLE_TESTING,
  onSuccess: (p) => onSuccess(p as Parameters<typeof onSuccess>[0]),
  onError: (p) => onError(p as Parameters<typeof onError>[0]),
  onTimeout: (p) => onTimeout(p as Parameters<typeof onTimeout>[0]),
});

export async function POST(request: Request) {
  const statusHeader = request.headers.get("X-Remotion-Status");
  console.log(
    `[remotion-webhook] POST received X-Remotion-Status=${statusHeader ?? "n/a"}`,
  );
  return baseHandler(request);
}

export const OPTIONS = POST;
