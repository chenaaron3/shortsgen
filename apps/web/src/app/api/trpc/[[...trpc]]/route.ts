import { env } from '~/env';
import { appRouter } from '~/server/api/root';
import { createTRPCContextFromFetch } from '~/server/api/trpc';

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContextFromFetch,
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });
}

export { handler as GET, handler as POST };
