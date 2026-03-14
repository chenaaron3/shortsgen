import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const runId = event.queryStringParameters?.runId;
  if (!runId) {
    return { statusCode: 400, body: "Missing runId" };
  }

  const connectionId = event.requestContext.connectionId;
  const ttlSec = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  await client.send(
    new PutItemCommand({
      TableName: Resource.ShortgenConnections.name,
      Item: {
        runId: { S: runId },
        connectionId: { S: connectionId },
        ttl: { N: String(ttlSec) },
      },
    })
  );

  return { statusCode: 200, body: "Connected" };
};
