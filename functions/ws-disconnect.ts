import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

const client = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  // On disconnect we don't have query params - connectionId is in requestContext
  // We'd need a reverse lookup (connectionId -> token) to delete. For simplicity,
  // we rely on TTL to expire stale entries. Alternatively we could store
  // connectionId as a secondary index. For MVP, TTL is sufficient.
  return { statusCode: 200, body: "Disconnected" };
};
