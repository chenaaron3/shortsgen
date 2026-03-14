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
  identitySource?: string[];
  headers?: Record<string, string>;
};

function deny(routeArn: string) {
  return {
    principalId: "api",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: routeArn,
        },
      ],
    },
  };
}

function allow(routeArn: string) {
  return {
    principalId: "api",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: routeArn,
        },
      ],
    },
  };
}

export function handler(event: AuthorizerEvent) {
  const routeArn = event.routeArn ?? "arn:aws:execute-api:*:*:*";
  try {
    const expected = process.env.SHORTGEN_API_SECRET;
    if (!expected) {
      return deny(routeArn);
    }

    const headers = event.headers ?? {};
    const token =
      event.identitySource?.[0] ??
      headers["x-api-secret"] ??
      headers["X-API-Secret"];
    if (!token || token !== expected) {
      console.error("Unauthorized request");
      return deny(routeArn);
    }
    console.log("Authorized request");
    return allow(routeArn);
  } catch {
    return deny(routeArn);
  }
}
