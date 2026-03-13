/**
 * Trigger the Run-Video pipeline Task.
 * Receives { runId, token, userInput }. Looks up connectionId from Dynamo, runs Task with env.
 */

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { Resource } from "sst";
import { task } from "sst/aws/task";

const dynamo = new DynamoDBClient({});

interface TriggerPayload {
  runId: string;
  token: string;
  userInput: string;
}

export async function handler(
  event: { body?: string; headers?: Record<string, string> }
): Promise<{ statusCode: number; body: string }> {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing body" }) };
  }

  let payload: TriggerPayload;
  try {
    payload = JSON.parse(event.body) as TriggerPayload;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { runId, token, userInput } = payload;
  if (!runId || !token || !userInput) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "runId, token, userInput required" }),
    };
  }

  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: Resource.ShortgenConnections.name,
      Key: { token: { S: token } },
    })
  );

  const connectionId = Item?.connectionId?.S ?? "";
  if (!connectionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "No WebSocket connection for token. Connect first.",
      }),
    };
  }

  await task.run(Resource.ShortgenGenerator, {
    RUN_ID: runId,
    CONNECTION_ID: connectionId,
    USER_INPUT: userInput,
    BUCKET_NAME: Resource.ShortgenAssets.name,
    WEBSOCKET_ENDPOINT: Resource.ShortgenProgressApi.managementEndpoint,
    DATABASE_URL: process.env.DATABASE_URL ?? "",
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ runId }),
  };
}
