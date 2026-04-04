/**
 * Trigger Initial Processing: breakdown + parallel clip processing (script -> scenes per clip).
 * Receives { runId }. Lambda loads source/config/max_nuggets from DB.
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
    if (authErr) {
      console.warn("[trigger-initial-processing] 401 Unauthorized");
      return authErr;
    }

    if (!event.body) {
      console.warn("[trigger-initial-processing] 400 Missing body");
      return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
    }

    const parsed = initialProcessingRequestSchema.safeParse(
      JSON.parse(event.body) as unknown,
    );
    if (!parsed.success) {
      console.warn("[trigger-initial-processing] 400 validation failed", parsed.error.flatten().formErrors);
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
    });
    return {
      statusCode: 202,
      body: JSON.stringify(response),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[trigger-initial-processing] error:", message, stack);
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
