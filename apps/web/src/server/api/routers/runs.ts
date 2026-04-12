import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { debitCredits, getBalance } from "~/server/credits";
import { generateBreakdownContent } from "~/server/ingest/generateBreakdownContent";
import { resolveUrlContent, type UrlContentSourceAdapter } from "~/server/ingest/urlContent";
import {
  assertUrlSafeForServerFetch,
  fetchUrlPreviewMetadata,
} from "~/server/ingest/urlMetadata";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
  CREDITS_ASSETS_PER_VIDEO,
  CREDITS_IMAGE_REGEN,
  CREDITS_INGEST_PER_RUN,
  runs,
  SCRIPT_REGEN_FREE_LIMIT,
  videos,
} from "@shortgen/db";
import { chunksSchema, manifestSchema } from "@shortgen/types";
import { TRPCError } from "@trpc/server";

import { triggerRemotionExports } from "./runs.utils";

import type { VideoManifest } from "@shortgen/types";
import type { InferSelectModel } from "drizzle-orm";

/** Run with videos relation. Used as explicit return type for getById so tRPC infers it. */
export type RunWithVideos = InferSelectModel<typeof runs> & {
  videos: InferSelectModel<typeof videos>[];
};

export const runsRouter = createTRPCRouter({
  /** List all runs for the current user with their videos. */
  listRunsForUser: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.runs
      .findMany({
        where: eq(runs.userId, ctx.session.user.id),
        orderBy: desc(runs.created_at),
        with: { videos: true },
      })
      .then((runsWithVideos) => ({ runs: runsWithVideos }));
  }),

  /** Get a run with its videos. */
  getById: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<RunWithVideos | null> => {
      const runWithVideos = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
        with: { videos: true },
      });

      if (!runWithVideos || runWithVideos.userId !== ctx.session.user.id)
        return null;

      return runWithVideos as RunWithVideos;
    }),

  /** SSRF-safe fetch of og:title / og:site_name for URL preview on create. */
  previewUrlMetadata: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return fetchUrlPreviewMetadata(input.url);
    }),

  /**
   * Create a run and immediately trigger initial processing (breakdown + clip processing).
   * Returns the same run + videos shape as getById plus wsUrl for clients that need it.
   */
  createRun: protectedProcedure
    .input(
      z.object({
        /** Always present: text body for text flow, page title/label for URL flow. */
        userInput: z.string().min(1),
        /** Optional URL for URL workflow; absent means pure text workflow. */
        sourceUrl: z
          .string()
          .min(1)
          .optional()
          .refine((s) => {
            if (!s) return true;
            try {
              return new URL(s.trim()).protocol === "https:";
            } catch {
              return false;
            }
          }, "Must be a valid https URL"),
        config: z
          .enum(["prototype", "default"])
          .optional()
          .default("prototype"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = input.config;
      let sourceContent = input.userInput.trim();
      const isUrlFlow = !!input.sourceUrl?.trim();
      let normalizedSourceUrl: string | null = null;
      let sourceAdapter: UrlContentSourceAdapter | null = null;
      if (isUrlFlow) {
        try {
          normalizedSourceUrl = assertUrlSafeForServerFetch(
            input.sourceUrl!.trim(),
          ).href;
          const resolved = await resolveUrlContent(normalizedSourceUrl!);
          sourceAdapter = resolved.sourceAdapter;
          console.info("[runs.createRun] URL ingest strategy selected", {
            strategy: resolved.strategy,
            sourceAdapter: resolved.sourceAdapter,
            sourceUrl: normalizedSourceUrl,
          });
          sourceContent = resolved.markdown.trim();
          if (!sourceContent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Could not extract source content from this URL. Please use a different link.",
            });
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              e instanceof Error
                ? e.message
                : "Could not extract source content from this URL. Please use a different link.",
          });
        }
      }
      const copy = await generateBreakdownContent(sourceContent);

      const [run] = await ctx.db
        .insert(runs)
        .values({
          userId: ctx.session.user.id,
          user_input: sourceContent,
          source_url: normalizedSourceUrl,
          source_adapter: sourceAdapter,
          title: copy.title,
          breakdown_messages: copy.breakdownMessagesJson,
          config,
          status: "breakdown",
        })
        .returning();

      if (!run) throw new Error("Failed to create run");

      const debitResult = await debitCredits(
        ctx.db,
        ctx.session.user.id,
        CREDITS_INGEST_PER_RUN,
        `run:${run.id}`,
      );

      if (!debitResult.ok) {
        await ctx.db.delete(runs).where(eq(runs.id, run.id));
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: debitResult.error,
        });
      }

      const balance = await getBalance(ctx.db, ctx.session.user.id);
      const maxNuggets = Math.min(
        5,
        Math.max(1, Math.floor(balance / CREDITS_ASSETS_PER_VIDEO)),
      );
      await ctx.db
        .update(runs)
        .set({ max_nuggets: maxNuggets })
        .where(eq(runs.id, run.id));

      const initialPayload = { runId: run.id };

      const res = await fetch(
        `${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/initial-processing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Secret": env.SHORTGEN_API_SECRET,
          },
          body: JSON.stringify(initialPayload),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        let parsed: { message?: string; error?: string };
        try {
          parsed = JSON.parse(err) as { message?: string; error?: string };
        } catch {
          parsed = {};
        }
        const msg = parsed.message ?? parsed.error ?? err;
        throw new Error(`Initial processing failed: ${msg}`);
      }

      await res.json();
      console.log(`[initial-processing] runId=${run.id} triggered`);

      const runWithVideos = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, run.id),
        with: { videos: true },
      });
      if (!runWithVideos || runWithVideos.userId !== ctx.session.user.id) {
        throw new Error("Failed to load run after create");
      }

      return {
        run: runWithVideos as RunWithVideos,
        wsUrl: `${env.NEXT_PUBLIC_SHORTGEN_WS_URL}?runId=${run.id}`,
      };
    }),

  /**
   * Apply feedback to a clip and regenerate chunks.
   */
  updateClipFeedback: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid(),
        scriptFeedback: z.string().optional(),
        sceneFeedback: z
          .array(z.object({ sceneIndex: z.number(), feedback: z.string() }))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const regenCount = (run.script_regen_count ?? 0) + 1;
      if (regenCount > SCRIPT_REGEN_FREE_LIMIT) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Script regeneration limit reached (${SCRIPT_REGEN_FREE_LIMIT} free per run). Upgrade for more.`,
        });
      }

      await ctx.db
        .update(runs)
        .set({ script_regen_count: regenCount })
        .where(eq(runs.id, input.runId));

      const res = await fetch(
        `${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/update-feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Secret": env.SHORTGEN_API_SECRET,
          },
          body: JSON.stringify({
            runId: input.runId,
            videoId: input.videoId,
            scriptFeedback: input.scriptFeedback,
            sceneFeedback: input.sceneFeedback,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Update feedback failed: ${err}`);
      }

      const data = (await res.json()) as { jobId: string; status: string };
      console.log(
        `[update-feedback] runId=${input.runId} videoId=${input.videoId} triggered`,
      );
      return { jobId: data.jobId, status: data.status };
    }),

  /**
   * Persist active scene drafts to DB. Frontend sends draft text/imagery by scene index.
   */
  acceptSceneSuggestions: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid(),
        sceneDraftsByIndex: z.record(
          z.string(),
          z.object({
            scriptText: z.string(),
            imageryText: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const [video] = await ctx.db
        .select()
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
        );

      if (!video) {
        throw new Error("Video not found");
      }

      const rawChunks =
        typeof video.chunks === "string"
          ? (JSON.parse(video.chunks) as unknown)
          : video.chunks;
      const parsedChunks = chunksSchema.safeParse(rawChunks);
      if (!parsedChunks.success) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Video chunks are invalid and cannot be updated",
        });
      }

      const nextScenes = parsedChunks.data.scenes.map((scene, idx) => {
        const patch = input.sceneDraftsByIndex[String(idx)];
        if (!patch) return scene;
        return {
          ...scene,
          text: patch.scriptText,
          imagery: patch.imageryText,
        };
      });

      const nextChunks = {
        ...parsedChunks.data,
        scenes: nextScenes,
      };

      await ctx.db
        .update(videos)
        .set({ chunks: JSON.stringify(nextChunks) })
        .where(eq(videos.id, input.videoId));

      return { ok: true };
    }),

  /**
   * Remove a clip during the scripting (review) phase, before assets are generated.
   * If this was the last video in the run, the run is deleted.
   */
  deleteVideo: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }

      if (run.status !== "scripting") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You can only delete videos during the review step.",
        });
      }

      const [video] = await ctx.db
        .select()
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
        );

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      }

      const allowedDuringScripting = new Set(["created", "scripts", "failed"]);
      if (!video.status || !allowedDuringScripting.has(video.status)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This video can no longer be removed.",
        });
      }

      await ctx.db.delete(videos).where(eq(videos.id, input.videoId));

      const remaining = await ctx.db
        .select({ id: videos.id })
        .from(videos)
        .where(eq(videos.run_id, input.runId));

      if (remaining.length === 0) {
        await ctx.db.delete(runs).where(eq(runs.id, input.runId));
        return { runDeleted: true as const };
      }

      return { runDeleted: false as const };
    }),

  /**
   * Trigger Remotion Lambda render for videos in a run that need export.
   * Only exports videos with status "assets". Run: set to "export" instantly.
   * Webhook marks each video "exported". Path derived as {s3_prefix}/short.mp4.
   */
  triggerExport: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const videosToExport = await ctx.db
        .select({ id: videos.id, s3_prefix: videos.s3_prefix })
        .from(videos)
        .where(
          and(
            eq(videos.run_id, input.runId),
            eq(videos.status, "assets"),
            isNotNull(videos.s3_prefix),
          ),
        );

      if (videosToExport.length === 0) {
        throw new Error("No videos ready to export");
      }

      const { results } = await triggerRemotionExports(
        ctx.db,
        input.runId,
        videosToExport.map((v) => ({ id: v.id, s3_prefix: v.s3_prefix! })),
      );

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        console.error("[triggerExport] Some renders failed:", failed);
        for (const f of failed) {
          if (f.status === "rejected") console.error(f.reason);
        }
      }

      return {
        triggeredCount: results.filter((r) => r.status === "fulfilled").length,
        failedCount: failed.length,
      };
    }),

  /**
   * Trigger Remotion Lambda render for a single video. Video must have status "assets".
   */
  triggerExportVideo: protectedProcedure
    .input(z.object({ runId: z.string().uuid(), videoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Run not found",
        });
      }

      const [video] = await ctx.db
        .select({
          id: videos.id,
          s3_prefix: videos.s3_prefix,
          status: videos.status,
        })
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
        );

      if (!video || video.status !== "assets" || !video.s3_prefix) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video not ready to export (must have status assets)",
        });
      }

      const { results } = await triggerRemotionExports(ctx.db, input.runId, [
        { id: video.id, s3_prefix: video.s3_prefix },
      ]);

      const fulfilled = results.find((r) => r.status === "fulfilled");
      if (fulfilled?.status !== "fulfilled") {
        const rejected = results.find((r) => r.status === "rejected");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            rejected?.status === "rejected"
              ? String(rejected.reason)
              : "Export failed",
        });
      }

      return { renderId: fulfilled.value.renderId };
    }),

  /**
   * Poll export progress for a video being rendered via Remotion Lambda.
   * Returns { overallProgress, done, fatalErrorEncountered }.
   */
  getExportProgress: protectedProcedure
    .input(z.object({ runId: z.string().uuid(), videoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Run not found" });
      }

      const [video] = await ctx.db
        .select({ render_id: videos.render_id, status: videos.status })
        .from(videos)
        .where(
          and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
        );

      if (!video || !video.render_id || video.status !== "exporting") {
        return {
          overallProgress: video?.status === "exported" ? 1 : 0,
          done: true,
          fatalErrorEncountered: false,
        };
      }

      const {
        REMOTION_LAMBDA_FUNCTION_NAME,
        REMOTION_LAMBDA_REGION,
        REMOTION_LAMBDA_SERVE_URL,
      } = env;

      // Progress lives in the site bucket, NOT the output bucket. See:
      // https://www.remotion.dev/docs/lambda/custom-destination
      const siteBucket =
        new URL(REMOTION_LAMBDA_SERVE_URL).hostname.split(".")[0] ?? "";

      try {
        const { getRenderProgress } = await import("@remotion/lambda/client");
        const progress = await getRenderProgress({
          renderId: video.render_id,
          bucketName: siteBucket,
          functionName: REMOTION_LAMBDA_FUNCTION_NAME,
          region: REMOTION_LAMBDA_REGION as Parameters<
            typeof import("@remotion/lambda/client").getRenderProgress
          >[0]["region"],
        });

        if (progress.done) {
          await ctx.db
            .update(videos)
            .set({ status: "exported" })
            .where(
              and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
            );
        }

        return {
          overallProgress: progress.overallProgress,
          done: progress.done,
          fatalErrorEncountered: progress.fatalErrorEncountered ?? false,
        };
      } catch (e) {
        console.warn(
          "[getExportProgress] Remotion getRenderProgress failed:",
          video.render_id,
          String(e),
        );
        return {
          overallProgress: 0,
          done: false,
          fatalErrorEncountered: false,
          /** Client should refetch run data; status reverted to assets to stop polling. */
          _retrySync: true,
        };
      }
    }),

  /**
   * Update single-scene imagery (direct or LLM) and regenerate image.
   */
  updateImagery: protectedProcedure
    .input(
      z
        .object({
          runId: z.string().uuid(),
          videoId: z.string().uuid(),
          sceneIndex: z.number().int().min(0),
          imagery: z.string().optional(),
          feedback: z.string().optional(),
        })
        .refine(
          (d) =>
            (d.imagery !== undefined && d.imagery.trim().length > 0) ||
            d.feedback !== undefined,
          { message: "Provide imagery or feedback" },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const debitResult = await debitCredits(
        ctx.db,
        ctx.session.user.id,
        CREDITS_IMAGE_REGEN,
        `imagery:${input.videoId}:${input.sceneIndex}`,
      );

      if (!debitResult.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: debitResult.error,
        });
      }

      const body: Record<string, unknown> = {
        runId: input.runId,
        videoId: input.videoId,
        sceneIndex: input.sceneIndex,
      };
      if (input.imagery !== undefined) body.imagery = input.imagery;
      if (input.feedback !== undefined) body.feedback = input.feedback;

      const res = await fetch(
        `${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/update-imagery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Secret": env.SHORTGEN_API_SECRET,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Update imagery failed: ${err}`);
      }

      const data = (await res.json()) as { jobId: string; status: string };
      return { jobId: data.jobId, status: data.status };
    }),

  /**
   * Batch finalize all videos in a run that have status "scripts".
   * Triggers Step Functions to run finalize_clip for each video in parallel.
   */
  finalizeAll: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const scriptsVideos = await ctx.db
        .select({ id: videos.id })
        .from(videos)
        .where(
          and(eq(videos.run_id, input.runId), eq(videos.status, "scripts")),
        );

      const videoIds = scriptsVideos.map((v) => v.id);
      if (videoIds.length === 0) {
        throw new Error("No videos in scripts phase to finalize");
      }

      const cost = scriptsVideos.length * CREDITS_ASSETS_PER_VIDEO;
      const debitResult = await debitCredits(
        ctx.db,
        ctx.session.user.id,
        cost,
        `finalize:${input.runId}`,
      );

      if (!debitResult.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: debitResult.error,
        });
      }

      await ctx.db
        .update(runs)
        .set({ status: "asset_gen" })
        .where(eq(runs.id, input.runId));

      const res = await fetch(
        `${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/finalize-all`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Secret": env.SHORTGEN_API_SECRET,
          },
          body: JSON.stringify({
            runId: input.runId,
            videoIds,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Finalize all failed: ${err}`);
      }

      const data = (await res.json()) as {
        jobId: string;
        status: string;
      };
      console.log(
        `[finalize-all] runId=${input.runId} videos=${videoIds.length} triggered`,
      );
      return { jobId: data.jobId, status: data.status };
    }),

  /**
   * Get video assets from a single endpoint:
   * - Returns manifest when available
   * - Falls back to S3 listing for partial images/voice when manifest is missing
   * - Includes exportUrl when video is exported
   */
  getVideoAssets: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid(),
      }),
    )
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        manifest?: VideoManifest;
        assetBaseUrl: string;
        imageByIndex: Record<number, string>;
        voiceByIndex: Record<number, string>;
        exportUrl?: string;
        backgroundMusicUrl: string;
      } | null> => {
        const [video] = await ctx.db
          .select({
            s3Prefix: videos.s3_prefix,
            status: videos.status,
          })
          .from(videos)
          .where(
            and(eq(videos.id, input.videoId), eq(videos.run_id, input.runId)),
          );

        if (!video?.s3Prefix) return null;

        const [run] = await ctx.db
          .select({ userId: runs.userId })
          .from(runs)
          .where(eq(runs.id, input.runId));

        if (!run || run.userId !== ctx.session.user.id) return null;

        const prefix = video.s3Prefix.replace(/\/$/, "");
        const cdnBase = env.SHORTGEN_CDN_URL.replace(/\/$/, "");
        const assetBaseUrl = `${cdnBase}/${prefix}`;
        const bucket = env.SHORTGEN_BUCKET_NAME;
        const manifestUrl = `${assetBaseUrl}/manifest.json`;
        const exportUrl =
          video.status === "exported"
            ? `${cdnBase}/${prefix}/short.mp4`
            : undefined;
        const backgroundMusicUrl = `${cdnBase}/assets/background_music.mp3`;
        const imageByIndex: Record<number, string> = {};
        const voiceByIndex: Record<number, string> = {};
        let manifest: VideoManifest | undefined;

        try {
          const res = await fetch(manifestUrl);
          if (res.ok) {
            const data = (await res.json()) as unknown;
            manifest = manifestSchema.parse(data);
          }
        } catch {
          console.log("error fetching manifest", manifestUrl);
        }

        if (!manifest) {
          const s3Prefix = prefix + "/";
          try {
            const client = new S3Client({});
            for (const subPrefix of ["images/", "voice/"] as const) {
              const fullPrefix = s3Prefix + subPrefix;
              let continuationToken: string | undefined;
              do {
                const resp = await client.send(
                  new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: fullPrefix,
                    ContinuationToken: continuationToken,
                  }),
                );
                for (const obj of resp.Contents ?? []) {
                  if (!obj.Key || !obj.Key.startsWith(fullPrefix)) continue;
                  const rel = obj.Key.slice(fullPrefix.length);
                  const match = rel.match(
                    subPrefix === "images/"
                      ? /^image_(\d+)\.png$/
                      : /^voice_(\d+)\.mp3$/,
                  );
                  if (!match) continue;
                  const sceneIndex = parseInt(match[1]!, 10) - 1;
                  const path = subPrefix + rel;
                  if (subPrefix === "images/") {
                    imageByIndex[sceneIndex] = path;
                  } else {
                    voiceByIndex[sceneIndex] = path;
                  }
                }
                continuationToken = resp.NextContinuationToken;
              } while (continuationToken);
            }
          } catch {
            // Best-effort listing; return what we have.
          }
        }

        return {
          manifest,
          assetBaseUrl,
          imageByIndex,
          voiceByIndex,
          exportUrl,
          backgroundMusicUrl,
        };
      },
    ),
});
