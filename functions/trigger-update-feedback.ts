/**
 * Trigger Update Clip Feedback: apply script + per-scene feedback, regenerate chunks.
 * Receives { runId, videoId, scriptFeedback?, sceneFeedback? }. Invokes ShortgenUpdateFeedback Lambda async.
 */

import { Resource } from "sst";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  updateClipFeedbackRequestSchema,
  updateFeedbackResponseSchema,
} from "@shortgen/types";

import { checkAuth } from "./check-auth";

const lambda = new LambdaClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  console.log("[trigger-update-feedback] invoked");
  try {
    const authErr = checkAuth(event.headers);
    if (authErr) {
      console.warn("[trigger-update-feedback] 401 Unauthorized");
      return authErr;
    }

    if (!event.body) {
      console.warn("[trigger-update-feedback] 400 Missing body");
      return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
    }

    const parsed = updateClipFeedbackRequestSchema.safeParse(
      JSON.parse(event.body) as unknown,
    );
    if (!parsed.success) {
      console.warn("[trigger-update-feedback] 400 validation failed", parsed.error.flatten().formErrors);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: parsed.error.flatten().formErrors }),
      };
    }

    console.log(
      "[trigger-update-feedback] invoking Lambda runId=",
      parsed.data.runId,
      "videoId=",
      parsed.data.videoId,
    );
    await lambda.send(
      new InvokeCommand({
        FunctionName: Resource.ShortgenUpdateFeedback.name,
        InvocationType: "Event",
        Payload: JSON.stringify(parsed.data),
      }),
    );

    const response = updateFeedbackResponseSchema.parse({
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
    console.error("[trigger-update-feedback] error:", message, stack);
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
