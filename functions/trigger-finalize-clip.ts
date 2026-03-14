/**
 * Trigger Finalize Clip: generate images + voice + prepare, upload to S3.
 * Receives { runId, videoId }. Invokes ShortgenFinalizeClip Lambda async.
 */

import { Resource } from "sst";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  finalizeClipRequestSchema,
  initialProcessingResponseSchema,
} from "@shortgen/types";

const lambda = new LambdaClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
  }

  const parsed = finalizeClipRequestSchema.safeParse(
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
      FunctionName: Resource.ShortgenFinalizeClip.name,
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
