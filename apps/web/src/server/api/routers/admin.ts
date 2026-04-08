import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { runs } from "@shortgen/db";

const LOG_GROUP_PREFIX = "/aws/lambda";
const SHORTGEN_PATTERN = "Shortgen";
const POLL_INTERVAL_MS = 500;
const MAX_POLL_MS = 30_000;
const PIPELINE_LAMBDA_PATTERNS = {
  initialProcessing: "ShortgenInitialProcessingFunction",
  updateImagery: "ShortgenUpdateImageryFunction",
  updateFeedback: "ShortgenUpdateFeedbackFunction",
  finalizeClip: "ShortgenFinalizeClipFunction",
} as const;
const EMPTY_PIPELINE_LOG_GROUPS: Record<
  keyof typeof PIPELINE_LAMBDA_PATTERNS,
  string | null
> = {
  initialProcessing: null,
  updateImagery: null,
  updateFeedback: null,
  finalizeClip: null,
};
const EMPTY_PIPELINE_LOG_STREAMS: Record<
  keyof typeof PIPELINE_LAMBDA_PATTERNS,
  string | null
> = {
  initialProcessing: null,
  updateImagery: null,
  updateFeedback: null,
  finalizeClip: null,
};

function getFieldValue(
  row: Array<{ field?: string; value?: string }>,
  fieldName: string,
): string | null {
  const match = row.find((f) => f.field === fieldName);
  return match?.value ?? null;
}

async function findMostRecentStreamContainingRunId(
  client: CloudWatchLogsClient,
  logGroupName: string,
  runId: string,
): Promise<string | null> {
  const endTimeSec = Math.floor(Date.now() / 1000);
  const startTimeSec = endTimeSec - 30 * 24 * 60 * 60; // 30 days

  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupNames: [logGroupName],
      queryString: `fields @timestamp, @logStream, @message | filter @message like /${runId}/ | sort @timestamp desc | limit 1`,
      startTime: startTimeSec,
      endTime: endTimeSec,
      limit: 1,
    }),
  );
  if (!queryId) {
    return null;
  }

  const startPoll = Date.now();
  let status: string;
  let results: Array<Array<{ field?: string; value?: string }>> = [];
  do {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (Date.now() - startPoll > MAX_POLL_MS) {
      return null;
    }
    const resp = await client.send(new GetQueryResultsCommand({ queryId }));
    status = resp.status ?? "Unknown";
    results = (resp.results ?? []) as Array<Array<{ field?: string; value?: string }>>;
  } while (status === "Running" || status === "Scheduled");

  const firstRow = results[0];
  if (!firstRow) {
    return null;
  }
  return getFieldValue(firstRow, "@logStream");
}

function getCloudWatchClient(): CloudWatchLogsClient | null {
  const region = process.env.AWS_REGION ?? "us-east-1";
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  return new CloudWatchLogsClient({ region });
}

export const adminRouter = createTRPCRouter({
  /** Returns whether the current user is an admin (for showing admin UI). */
  isAdmin: protectedProcedure.query(({ ctx }) => {
    const emails = env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin =
      emails.length > 0 &&
      !!ctx.session.user.email &&
      emails.includes(ctx.session.user.email.toLowerCase());
    return { isAdmin };
  }),

  /** Fetch CloudWatch logs for a run. When videoId is provided, returns only logs for that video (excludes other videos in the run). */
  getRunLogs: adminProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
        columns: { id: true, created_at: true },
      });
      if (!run) {
        return { logs: [], error: "Run not found" };
      }

      const client = getCloudWatchClient();
      if (!client) {
        return {
          logs: [],
          error:
            "AWS credentials not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)",
        };
      }

      try {
        const { logGroups } = await client.send(
          new DescribeLogGroupsCommand({
            logGroupNamePrefix: LOG_GROUP_PREFIX,
          }),
        );
        const shortgenGroups =
          logGroups
            ?.filter((lg: { logGroupName?: string }) =>
              lg.logGroupName?.includes(SHORTGEN_PATTERN),
            )
            .map((lg: { logGroupName?: string }) => lg.logGroupName!)
            .filter(Boolean) ?? [];
        if (shortgenGroups.length === 0) {
          return { logs: [], error: "No Shortgen log groups found" };
        }

        const createdMs = run.created_at
          ? new Date(run.created_at).getTime()
          : Date.now() - 24 * 60 * 60 * 1000;
        const startTimeSec = Math.floor(createdMs / 1000);
        const endTimeSec = Math.floor(Date.now() / 1000);

        const filterClause = input.videoId
          ? `filter @message like /${input.runId}/ and ( @message like /${input.videoId}/ or @message not like /videoId/ )`
          : `filter @message like /${input.runId}/ and @message not like /videoId/`;

        const { queryId } = await client.send(
          new StartQueryCommand({
            logGroupNames: shortgenGroups,
            queryString: `fields @timestamp, @logStream, @message | ${filterClause} | sort @timestamp asc`,
            startTime: startTimeSec,
            endTime: endTimeSec,
            limit: 10_000,
          }),
        );
        if (!queryId) {
          return { logs: [], error: "Failed to start CloudWatch query" };
        }

        const startPoll = Date.now();
        let status: string;
        let results: Array<Array<{ field?: string; value?: string }>> = [];
        do {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (Date.now() - startPoll > MAX_POLL_MS) {
            return { logs: [], error: "CloudWatch query timed out" };
          }
          const resp = await client.send(
            new GetQueryResultsCommand({ queryId }),
          );
          status = resp.status ?? "Unknown";
          results = (resp.results ?? []) as Array<
            Array<{ field?: string; value?: string }>
          >;
        } while (status === "Running" || status === "Scheduled");

        const logs = results.map((row) => {
          const map = (row as Array<{ field?: string; value?: string }>).reduce(
            (acc, f) => {
              if (f.field != null) acc[f.field] = f.value ?? "";
              return acc;
            },
            {} as Record<string, string>,
          );
          return {
            timestamp: map["@timestamp"] ?? "",
            logStream: map["@logStream"] ?? "",
            message: map["@message"] ?? "",
          };
        });

        return { logs };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { logs: [], error: `CloudWatch error: ${msg}` };
      }
    }),

  /** Return CloudWatch log groups for pipeline lambdas. */
  getPipelineLambdaLogGroups: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
    const client = getCloudWatchClient();
    if (!client) {
      return {
        logGroups: EMPTY_PIPELINE_LOG_GROUPS,
        logStreams: EMPTY_PIPELINE_LOG_STREAMS,
        error:
          "AWS credentials not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)",
      };
    }

      try {
        const { logGroups } = await client.send(
          new DescribeLogGroupsCommand({
            logGroupNamePrefix: LOG_GROUP_PREFIX,
          }),
        );

        const shortgenGroups =
          logGroups
            ?.map((lg: { logGroupName?: string }) => lg.logGroupName ?? "")
            .filter((name) => name.includes(SHORTGEN_PATTERN)) ?? [];

        const logGroupsByLambda = Object.fromEntries(
          Object.entries(PIPELINE_LAMBDA_PATTERNS).map(([key, pattern]) => {
            const match = shortgenGroups.find((name) => name.includes(pattern));
            return [key, match ?? null];
          }),
        ) as Record<keyof typeof PIPELINE_LAMBDA_PATTERNS, string | null>;

        const logStreamsByLambdaEntries = await Promise.all(
          Object.entries(logGroupsByLambda).map(async ([key, logGroupName]) => {
            if (!logGroupName) {
              return [key, null] as const;
            }
            try {
              const runScopedStream = await findMostRecentStreamContainingRunId(
                client,
                logGroupName,
                input.runId,
              );
              if (runScopedStream) {
                return [key, runScopedStream] as const;
              }

              // Fallback when no stream contains this runId.
              const resp = await client.send(
                new DescribeLogStreamsCommand({
                  logGroupName,
                  orderBy: "LastEventTime",
                  descending: true,
                  limit: 1,
                }),
              );
              return [key, resp.logStreams?.[0]?.logStreamName ?? null] as const;
            } catch {
              return [key, null] as const;
            }
          }),
        );
        const logStreamsByLambda = Object.fromEntries(logStreamsByLambdaEntries) as Record<
          keyof typeof PIPELINE_LAMBDA_PATTERNS,
          string | null
        >;

        return { logGroups: logGroupsByLambda, logStreams: logStreamsByLambda };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          logGroups: EMPTY_PIPELINE_LOG_GROUPS,
          logStreams: EMPTY_PIPELINE_LOG_STREAMS,
          error: `CloudWatch error: ${msg}`,
        };
      }
    }),

  /** List artifact keys for a run (breakdown.json, {videoId}/script.md, etc.). */
  listArtifacts: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
        columns: { id: true },
      });
      if (!run) {
        return { keys: [], error: "Run not found" };
      }
      const bucket = env.SHORTGEN_BUCKET_NAME;
      if (!bucket) {
        return { keys: [], error: "SHORTGEN_BUCKET_NAME not configured" };
      }
      try {
        const client = new S3Client({});
        const prefix = `runs/${input.runId}/`;
        const keys: string[] = [];
        let continuationToken: string | undefined;
        do {
          const resp = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          );
          for (const obj of resp.Contents ?? []) {
            if (obj.Key && obj.Key.startsWith(prefix)) {
              keys.push(obj.Key.slice(prefix.length));
            }
          }
          continuationToken = resp.NextContinuationToken;
        } while (continuationToken);
        return { keys };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { keys: [], error: `S3 error: ${msg}` };
      }
    }),

  /** Get CDN URL for an artifact. All asset reads go through CDN. */
  getArtifactUrl: adminProcedure
    .input(z.object({ runId: z.string().uuid(), path: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
        columns: { id: true },
      });
      if (!run) {
        return { url: null, error: "Run not found" };
      }
      const key = `runs/${input.runId}/${input.path}`.replace(/\/+/g, "/");
      if (key.includes("..")) {
        return { url: null, error: "Invalid path" };
      }
      if (!env.SHORTGEN_CDN_URL) {
        return { url: null, error: "SHORTGEN_CDN_URL not configured" };
      }
      const cdnBase = env.SHORTGEN_CDN_URL.replace(/\/$/, "");
      return { url: `${cdnBase}/${key}` };
    }),
});
