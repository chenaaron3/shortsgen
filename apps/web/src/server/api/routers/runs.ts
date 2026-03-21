import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { debitCredits } from "~/server/credits";

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

import type { VideoManifest } from "@shortgen/types";
import type { InferSelectModel } from "drizzle-orm";

const BREAKDOWN_SYSTEM = `You generate a short title and playful loading messages for a video creation app. The user pasted content and the app is analyzing it to create short-form videos.

Title:
- 3-8 words, descriptive of the content (topic, theme, or vibe)
- Suitable for a list/card view (e.g. "How to Make Sourdough", "The History of Coffee", "5 Productivity Hacks")

Messages (each 2-8 words):
- Feel like a Discord update: witty, light, occasionally silly
- Reference the content when possible (topics, tone, themes)
- Sound like something is actively happening

Infer content type from the text (how-to, essay, transcript, story, recipe, etc.) and tailor both title and messages. Avoid generic phrases like "Analyzing..." unless you add a twist.

Examples: "Consulting the content council…", "Finding the climax…", "Checking if the intro hooks…"`;

const breakdownOutputSchema = z.object({
  title: z.string().min(1).max(80),
  messages: z.array(z.string().min(1).max(60)).min(1),
});

async function generateBreakdownContent(
  content: string,
): Promise<{ title: string; messages: string[] } | null> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const truncated = content.slice(0, 4000);
  const res = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: BREAKDOWN_SYSTEM },
      { role: "user", content: truncated },
    ],
    max_tokens: 250,
    response_format: zodResponseFormat(
      breakdownOutputSchema,
      "breakdown_output",
    ),
  });
  const parsed = res.choices[0]?.message?.parsed;
  if (!parsed) return null;
  const result = breakdownOutputSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

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

  /**
   * Create a run and immediately trigger initial processing (breakdown + clip processing).
   * Returns runId and wsUrl. Client should connect to WebSocket before redirecting to edit page.
   */
  createRun: protectedProcedure
    .input(
      z.object({
        userInput: z.string().min(1),
        /** Pipeline config: prototype (cheap/fast) or default (full quality). From user tier. */
        config: z
          .enum(["prototype", "default"])
          .optional()
          .default("prototype"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .insert(runs)
        .values({
          userId: ctx.session.user.id,
          user_input: input.userInput,
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

      const [, breakdown] = await Promise.all([
        (async () => {
          const res = await fetch(
            `${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/initial-processing`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Secret": env.SHORTGEN_API_SECRET,
              },
              body: JSON.stringify({
                runId: run.id,
                sourceContent: input.userInput,
                config: input.config,
              }),
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
        })(),
        generateBreakdownContent(input.userInput),
      ]);
      if (breakdown && breakdown.messages.length > 0) {
        await ctx.db
          .update(runs)
          .set({
            title: breakdown.title,
            breakdown_messages: JSON.stringify(breakdown.messages),
          })
          .where(eq(runs.id, run.id));
      }

      return {
        runId: run.id,
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
   * Persist accepted LLM scene suggestions (ChunksOutput) to DB. Call after user accepts
   * the revision from suggestion_completed (stored in sceneSuggestionsByVideo until cleared).
   */
  acceptSceneSuggestions: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        videoId: z.string().uuid(),
        chunks: chunksSchema,
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

      await ctx.db
        .update(videos)
        .set({ chunks: JSON.stringify(input.chunks) })
        .where(eq(videos.id, input.videoId));

      return { ok: true };
    }),

  /**
   * Trigger Remotion Lambda render for exportable videos in a run.
   * Run: set to "export" instantly. Videos: exportable = assets | exported; each gets job + status "exporting".
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
            inArray(videos.status, ["assets", "exported"]),
            isNotNull(videos.s3_prefix),
          ),
        );

      if (videosToExport.length === 0) {
        throw new Error("No videos ready to export");
      }

      const {
        REMOTION_LAMBDA_FUNCTION_NAME,
        REMOTION_LAMBDA_REGION,
        REMOTION_LAMBDA_SERVE_URL,
        REMOTION_WEBHOOK_URL,
        REMOTION_WEBHOOK_SECRET,
        SHORTGEN_CDN_URL,
        SHORTGEN_BUCKET_NAME,
      } = env;

      // Run: set to "export" instantly
      await ctx.db
        .update(runs)
        .set({ status: "export" })
        .where(eq(runs.id, input.runId));

      const cdnBase = SHORTGEN_CDN_URL.replace(/\/$/, "");
      const { renderMediaOnLambda } = await import("@remotion/lambda/client");

      const webhook = {
        url: REMOTION_WEBHOOK_URL,
        secret: REMOTION_WEBHOOK_SECRET,
      };

      const results = await Promise.allSettled(
        videosToExport.map(async (v) => {
          const s3Prefix = v.s3_prefix!.replace(/\/$/, "");
          const assetBaseUrl = `${cdnBase}/${s3Prefix}`;
          const outKey = `${s3Prefix}/short.mp4`;
          const backgroundMusicUrl = `${cdnBase}/assets/background_music.mp3`;

          const result = await renderMediaOnLambda({
            region: REMOTION_LAMBDA_REGION as Parameters<
              typeof import("@remotion/lambda/client").renderMediaOnLambda
            >[0]["region"],
            functionName: REMOTION_LAMBDA_FUNCTION_NAME,
            serveUrl: REMOTION_LAMBDA_SERVE_URL,
            composition: "ShortVideo-AssetBase",
            inputProps: { assetBaseUrl, backgroundMusicUrl },
            codec: "h264",
            webhook: {
              ...webhook,
              customData: { runId: input.runId, videoId: v.id },
            },
            outName: {
              key: outKey,
              bucketName: SHORTGEN_BUCKET_NAME,
            },
            privacy: "no-acl",
          });

          await ctx.db
            .update(videos)
            .set({ status: "exporting" })
            .where(eq(videos.id, v.id));

          return result;
        }),
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
   * Get video assets (manifest + CDN base URL) for preview. All asset reads go through CDN.
   * When video is exported, includes exportUrl for download.
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
        manifest: VideoManifest;
        assetBaseUrl: string;
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
        const manifestUrl = `${assetBaseUrl}/manifest.json`;

        try {
          const res = await fetch(manifestUrl);
          if (!res.ok) return null;
          const data = (await res.json()) as unknown;
          const manifest = manifestSchema.parse(data);
          const exportUrl =
            video.status === "exported"
              ? `${cdnBase}/${prefix}/short.mp4`
              : undefined;
          const backgroundMusicUrl = `${cdnBase}/assets/background_music.mp3`;
          return {
            manifest,
            assetBaseUrl,
            exportUrl,
            backgroundMusicUrl,
          };
        } catch {
          console.log("error fetching manifest", manifestUrl);
          return null;
        }
      },
    ),
});
