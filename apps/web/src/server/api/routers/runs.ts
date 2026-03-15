import { z } from "zod";
import { chunksSchema } from "@shortgen/types";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

import { runs, videos } from "@shortgen/db";
import { and, desc, eq, type InferSelectModel } from "drizzle-orm";

/** Run with videos relation. Used as explicit return type for getById so tRPC infers it. */
export type RunWithVideos = InferSelectModel<typeof runs> & {
  videos: InferSelectModel<typeof videos>[];
};

export const runsRouter = createTRPCRouter({
  /** List all runs for the current user with their videos. */
  listRunsForUser: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.runs.findMany({
      where: eq(runs.userId, ctx.session.user.id),
      orderBy: desc(runs.created_at),
      with: { videos: true },
    }).then((runsWithVideos) => ({ runs: runsWithVideos }));
  }),

  /** Get a run with its videos. */
  getById: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<RunWithVideos | null> => {
      const runWithVideos = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.runId),
        with: { videos: true },
      });

      if (!runWithVideos || runWithVideos.userId !== ctx.session.user.id) return null;

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
        config: z.enum(["prototype", "default"]).optional().default("prototype"),
      })
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

      const res = await fetch(`${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/initial-processing`, {
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
      });

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const res = await fetch(`${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/update-feedback`, {
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
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Update feedback failed: ${err}`);
      }

      const data = (await res.json()) as { jobId: string; status: string };
      console.log(`[update-feedback] runId=${input.runId} videoId=${input.videoId} triggered`);
      return { jobId: data.jobId, status: data.status };
    }),

  /**
   * Accept feedback suggestion and persist chunks to DB. Call after user accepts
   * the suggestion shown from feedback_completed (chunks in store).
   */
  acceptFeedbackChunks: protectedProcedure
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
          and(
            eq(videos.id, input.videoId),
            eq(videos.run_id, input.runId),
          ),
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
   * Move all videos in a run from assets to export phase. Quick DB write.
   * Call when assets are generated and user is ready to export.
   */
  finalizeAssets: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) {
        throw new Error("Run not found");
      }

      const result = await ctx.db
        .update(videos)
        .set({ status: "export" })
        .where(
          and(
            eq(videos.run_id, input.runId),
            eq(videos.status, "assets"),
          ),
        )
        .returning({ id: videos.id });

      if (result.length > 0) {
        await ctx.db
          .update(runs)
          .set({ status: "export" })
          .where(eq(runs.id, input.runId));
      }

      return { updatedCount: result.length };
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
          and(
            eq(videos.run_id, input.runId),
            eq(videos.status, "scripts"),
          ),
        );

      const videoIds = scriptsVideos.map((v) => v.id);
      if (videoIds.length === 0) {
        throw new Error("No videos in scripts phase to finalize");
      }

      await ctx.db
        .update(runs)
        .set({ status: "asset_gen" })
        .where(eq(runs.id, input.runId));

      const res = await fetch(`${env.SHORTGEN_API_URL.replace(/\/$/, "")}/runs/finalize-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Secret": env.SHORTGEN_API_SECRET,
        },
        body: JSON.stringify({
          runId: input.runId,
          videoIds,
        }),
      });

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

});
