/**
 * Trigger Finalize Clip: generate images + voice + prepare, upload to S3.
 * Receives { runId, videoId }. Invokes ShortgenFinalizeClip Lambda async.
 */

import { Resource } from "sst";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  finalizeClipRequestSchema,
  finalizeClipResponseSchema,
} from "@shortgen/types";

import { checkAuth } from "./check-auth";

const lambda = new LambdaClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  console.log("[trigger-finalize-clip] invoked");
  try {
    const authErr = checkAuth(event.headers);
    if (authErr) {
      console.warn("[trigger-finalize-clip] 401 Unauthorized");
      return authErr;
    }

    if (!event.body) {
      console.warn("[trigger-finalize-clip] 400 Missing body");
      return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
    }

    const parsed = finalizeClipRequestSchema.safeParse(
      JSON.parse(event.body) as unknown,
    );
    if (!parsed.success) {
      console.warn("[trigger-finalize-clip] 400 validation failed", parsed.error.flatten().formErrors);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: parsed.error.flatten().formErrors }),
      };
    }

    console.log(
      "[trigger-finalize-clip] invoking Lambda runId=",
      parsed.data.runId,
      "videoId=",
      parsed.data.videoId,
    );
    await lambda.send(
      new InvokeCommand({
        FunctionName: Resource.ShortgenFinalizeClip.name,
        InvocationType: "Event",
        Payload: JSON.stringify(parsed.data),
      }),
    );

    const response = finalizeClipResponseSchema.parse({
      jobId: parsed.data.runId,
      status: "started",
    });
    return {
      statusCode: 202,
      body: JSON.stringify(response),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[trigger-finalize-clip] error:", message, stack);
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
