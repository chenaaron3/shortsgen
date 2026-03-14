import {
  DynamoDBClient,
  DeleteItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME!;
const GSI_NAME = "ConnectionIdIndex";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log("[ws-disconnect] connectionId=", connectionId);

  if (!TABLE_NAME || !connectionId) {
    console.warn("[ws-disconnect] skip: missing TABLE_NAME or connectionId");
    return { statusCode: 200, body: "Disconnected" };
  }

  try {
    // Look up runId via GSI (connectionId -> runId)
    const queryResp = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI_NAME,
        KeyConditionExpression: "connectionId = :connId",
        ExpressionAttributeValues: { ":connId": { S: connectionId } },
        ProjectionExpression: "runId",
      })
    );
    const items = queryResp.Items ?? [];
    if (items.length === 0) {
      console.log("[ws-disconnect] no row for connectionId, nothing to delete");
      return { statusCode: 200, body: "Disconnected" };
    }

    const runId = items[0]?.runId?.S;
    if (!runId) {
      console.log("[ws-disconnect] item missing runId, skip delete");
      return { statusCode: 200, body: "Disconnected" };
    }

    console.log("[ws-disconnect] deleting runId=", runId, "connectionId=", connectionId);

    // Delete only if this connectionId still owns the row (avoids race with overwrite)
    await client.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: { runId: { S: runId } },
        ConditionExpression: "connectionId = :connId",
        ExpressionAttributeValues: { ":connId": { S: connectionId } },
      })
    );
    console.log("[ws-disconnect] deleted runId=", runId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "";
    if (name === "ConditionalCheckFailedException") {
      console.log("[ws-disconnect] row overwritten by new connection, skip delete");
    } else {
      console.warn("[ws-disconnect] cleanup failed:", connectionId, msg);
    }
  }
  return { statusCode: 200, body: "Disconnected" };
};
