import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

import { runs, videos } from "@shortgen/db";
import { eq } from "drizzle-orm";

export const runsRouter = createTRPCRouter({
  /** Get a run with its videos. */
  getById: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(runs)
        .where(eq(runs.id, input.runId));

      if (!run || run.userId !== ctx.session.user.id) return null;

      const runVideos = await ctx.db
        .select()
        .from(videos)
        .where(eq(videos.runId, input.runId));

      return { ...run, videos: runVideos };
    }),

  /**
   * Start a new video generation run. Creates Run, triggers pipeline Task.
   * Client must connect to WebSocket with ?token=X before calling this.
   */
  trigger: protectedProcedure
    .input(
      z.object({
        userInput: z.string().min(1),
        token: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .insert(runs)
        .values({
          userId: ctx.session.user.id,
          userInput: input.userInput,
          status: "processing",
        })
        .returning();

      if (!run) throw new Error("Failed to create run");

      const triggerUrl = process.env.TRIGGER_RUN_URL;
      if (!triggerUrl) {
        throw new Error(
          "TRIGGER_RUN_URL not configured. Set it from SST outputs (triggerUrl) after deploy.",
        );
      }

      const res = await fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: run.id,
          token: input.token,
          userInput: input.userInput,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Trigger failed: ${err}`);
      }

      const wsUrl = process.env.NEXT_PUBLIC_SHORTGEN_WS_URL;
      if (!wsUrl) {
        throw new Error(
          "NEXT_PUBLIC_SHORTGEN_WS_URL not configured. Set it from SST outputs (wsUrl) after deploy.",
        );
      }

      return {
        runId: run.id,
        wsUrl: `${wsUrl}?token=${input.token}`,
      };
    }),
});
