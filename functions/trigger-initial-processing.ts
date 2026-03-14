/**
 * Trigger Initial Processing: breakdown + parallel clip processing (script -> scenes per clip).
 * Receives { runId, sourceContent, config? }. Invokes ShortgenInitialProcessing Lambda async.
 */

import { Resource } from "sst";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  initialProcessingRequestSchema,
  initialProcessingResponseSchema,
} from "@shortgen/types";

import { checkAuth } from "./check-auth";

const lambda = new LambdaClient({});

export async function handler(event: {
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; body: string }> {
  console.log("[trigger-initial-processing] invoked");
  try {
    const authErr = checkAuth(event.headers);
    if (authErr) return authErr;

    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
    }

    const parsed = initialProcessingRequestSchema.safeParse(
      JSON.parse(event.body) as unknown,
    );
    if (!parsed.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: parsed.error.flatten().formErrors }),
      };
    }

    const functionName = Resource.ShortgenInitialProcessing?.name;
    if (!functionName) {
      throw new Error(
        "ShortgenInitialProcessing not linked to trigger. Check sst.config.ts route has link: [initialProcessing].",
      );
    }
    console.log("[trigger-initial-processing] invoking Lambda", functionName, "runId=", parsed.data.runId);
    await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: JSON.stringify(parsed.data),
      }),
    );

    const response = initialProcessingResponseSchema.parse({
      jobId: parsed.data.runId,
      status: "started",
      logsUrl: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/${encodeURIComponent(`/aws/lambda/${functionName}`)}`,
    });
    return {
      statusCode: 202,
      body: JSON.stringify(response),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("trigger-initial-processing error:", message, stack);
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
