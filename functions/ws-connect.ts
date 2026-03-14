import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";

const client = new DynamoDBClient({});

/** Table name from env (SST link may not inject Resource for WebSocket routes). */
const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME!;

/** WebSocket $connect events include query params at runtime; @types/aws-lambda may omit them. */
type ConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string | undefined>;
  multiValueQueryStringParameters?: Record<string, string[] | undefined>;
};

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const ev = event as ConnectEvent;
  const runId =
    ev.queryStringParameters?.runId ??
    (Array.isArray(ev.multiValueQueryStringParameters?.runId)
      ? ev.multiValueQueryStringParameters.runId[0]
      : undefined);
  console.log("[ws-connect] event", {
    hasQueryStringParameters: !!ev.queryStringParameters,
    hasMultiValue: !!ev.multiValueQueryStringParameters,
    runId: runId ?? "(missing)",
  });
  if (!runId) {
    console.warn("[ws-connect] 400 Missing runId");
    return { statusCode: 400, body: "Missing runId" };
  }

  const connectionId = event.requestContext.connectionId;
  const ttlSec = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  if (!TABLE_NAME) {
    console.error("[ws-connect] CONNECTIONS_TABLE_NAME not set");
    return { statusCode: 500, body: "Server misconfigured" };
  }
  try {
    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          runId: { S: runId },
          connectionId: { S: connectionId },
          ttl: { N: String(ttlSec) },
        },
      })
    );
    return { statusCode: 200, body: "Connected" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[ws-connect] error runId=", runId, "connectionId=", connectionId, message, stack);
    return { statusCode: 500, body: "Connection failed" };
  }
};
