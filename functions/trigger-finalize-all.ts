/**
 * Trigger Finalize All: batch finalize all videos in a run via Step Functions.
 * Receives { runId, videoIds }. Starts Step Functions execution that invokes
 * finalize_clip Lambda for each video in parallel.
 */

import { Resource } from "sst";

import {
  StartExecutionCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import {
  finalizeAllRequestSchema,
  finalizeAllResponseSchema,
} from "@shortgen/types";

import { checkAuth } from "./check-auth";

const sfn = new SFNClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  console.log("[trigger-finalize-all] invoked");
  try {
    const authErr = checkAuth(event.headers);
    if (authErr) {
      console.warn("[trigger-finalize-all] 401 Unauthorized");
      return authErr;
    }

    if (!event.body) {
      console.warn("[trigger-finalize-all] 400 Missing body");
      return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
    }

    const parsed = finalizeAllRequestSchema.safeParse(
      JSON.parse(event.body) as unknown,
    );
    if (!parsed.success) {
      console.warn("[trigger-finalize-all] 400 validation failed", parsed.error.flatten().formErrors);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: parsed.error.flatten().formErrors }),
      };
    }

    const { runId, videoIds } = parsed.data;
    const items = videoIds.map((videoId) => ({ runId, videoId }));

    const arn = Resource.ShortgenFinalizeAllStateMachine?.arn;
    if (!arn) {
      throw new Error(
        "ShortgenFinalizeAllStateMachine not linked. Check sst.config.ts.",
      );
    }

    console.log("[trigger-finalize-all] starting execution runId=", runId, "videos=", videoIds.length);
    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: arn,
        input: JSON.stringify({ items }),
        name: `finalize-${runId}-${Date.now()}`,
      }),
    );

    const response = finalizeAllResponseSchema.parse({
      jobId: runId,
      status: "started",
    });
    return {
      statusCode: 202,
      body: JSON.stringify(response),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[trigger-finalize-all] error:", message, stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        message,
        ...(process.env.NODE_ENV === "development" && stack && { stack }),
      }),
    };
  }
}
