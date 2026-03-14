/**
 * Lambda authorizer for API Gateway. Validates X-API-Secret header.
 * Only the tRPC server (Next.js) should have the secret.
 *
 * Uses IAM policy format (response: "iam") - more reliable than simple response
 * which can fail with "did not include 'isAuthorized'" due to bundling.
 */

export type AuthorizerEvent = {
  type?: string;
  routeArn?: string;
  methodArn?: string; // Format 1.0
  identitySource?: string[];
  headers?: Record<string, string>;
};

// Use bracket notation with string literals so bundler cannot minify/rename keys.
// API Gateway requires exact keys: principalId, policyDocument.
function deny(routeArn: string) {
  const res: Record<string, unknown> = {};
  res["principalId"] = "api";
  res["policyDocument"] = {
    Version: "2012-10-17",
    Statement: [
      { Action: "execute-api:Invoke", Effect: "Deny", Resource: routeArn },
    ],
  };
  return res;
}

function allow(routeArn: string) {
  const res: Record<string, unknown> = {};
  res["principalId"] = "api";
  res["policyDocument"] = {
    Version: "2012-10-17",
    Statement: [
      { Action: "execute-api:Invoke", Effect: "Allow", Resource: routeArn },
    ],
  };
  return res;
}

export function handler(event: AuthorizerEvent) {
  // Format 2.0 uses routeArn; format 1.0 uses methodArn
  const routeArn =
    event.routeArn ?? event.methodArn ?? "arn:aws:execute-api:*:*:*";
  try {
    const expected = process.env.SHORTGEN_API_SECRET;
    if (!expected) {
      console.error("[authorizer] Deny: SHORTGEN_API_SECRET not set");
      return deny(routeArn);
    }

    const headers = event.headers ?? {};
    // HTTP API v2 passes headers lowercase; identitySource may use either case
    const token =
      event.identitySource?.[0] ??
      headers["x-api-secret"] ??
      headers["X-API-Secret"];
    if (!token) {
      console.error(
        "[authorizer] Deny: no token. identitySource=",
        event.identitySource?.length ?? 0,
        "headerKeys=",
        Object.keys(headers).filter((k) => k.toLowerCase().includes("api") || k.toLowerCase().includes("secret")),
      );
      return deny(routeArn);
    }
    if (token !== expected) {
      console.error("[authorizer] Deny: token mismatch");
      return deny(routeArn);
    }
    console.log("[authorizer] Allow");
    return allow(routeArn);
  } catch (err) {
    console.error("[authorizer] Deny: exception", err);
    return deny(routeArn);
  }
}
