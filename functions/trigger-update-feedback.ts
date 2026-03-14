/**
 * Trigger Update Clip Feedback: apply script + per-scene feedback, regenerate chunks.
 * Receives { runId, videoId, scriptFeedback?, sceneFeedback? }. Invokes ShortgenUpdateFeedback Lambda async.
 */

import { Resource } from "sst";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  initialProcessingResponseSchema,
  updateClipFeedbackRequestSchema,
} from "@shortgen/types";

import { checkAuth } from "./check-auth";

const lambda = new LambdaClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  const authErr = checkAuth(event.headers);
  if (authErr) return authErr;

  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
  }

  const parsed = updateClipFeedbackRequestSchema.safeParse(
    JSON.parse(event.body) as unknown,
  );
  if (!parsed.success) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: parsed.error.flatten().formErrors }),
    };
  }

  await lambda.send(
    new InvokeCommand({
      FunctionName: Resource.ShortgenUpdateFeedback.name,
      InvocationType: "Event",
      Payload: JSON.stringify(parsed.data),
    }),
  );

  const response = initialProcessingResponseSchema.parse({
    jobId: parsed.data.runId,
    status: "started",
  });
  return {
    statusCode: 202,
    body: JSON.stringify(response),
  };
}
