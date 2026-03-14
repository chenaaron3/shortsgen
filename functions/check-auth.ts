/**
 * Shared auth check for API trigger Lambdas. Validates X-API-Secret header.
 * Requires ShortgenApiSecret to be linked to the Lambda.
 */

import { Resource } from "sst";

export function checkAuth(
  headers?: Record<string, string>,
): { statusCode: number; body: string } | null {
  const secret = headers?.["x-api-secret"] ?? headers?.["X-API-Secret"];
  const expected =
    Resource.ShortgenApiSecret?.value ?? process.env.SHORTGEN_API_SECRET;
  if (!expected || secret !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  return null;
}
