"use client";

import { useCallback } from "react";
import { chunksSchema } from "@shortgen/types";
import { api } from "~/utils/api";

import type { RouterOutputs } from "~/utils/api";

type RunByIdOutput = RouterOutputs["runs"]["getById"];
type SceneDraftPatch = { scriptText: string; imageryText: string };
type SceneDraftsByIndex = Record<string, SceneDraftPatch>;

function patchVideoChunks(
  chunks: string | null,
  sceneDraftsByIndex: SceneDraftsByIndex,
): string | null {
  if (!chunks) return chunks;
  const raw =
    (() => {
      try {
        return JSON.parse(chunks) as unknown;
      } catch {
        return null;
      }
    })();
  if (raw === null) return chunks;
  const parsed = chunksSchema.safeParse(raw);
  if (!parsed.success) return chunks;

  const nextScenes = parsed.data.scenes.map((scene, idx) => {
    const patch = sceneDraftsByIndex[String(idx)];
    if (!patch) return scene;
    return {
      ...scene,
      text: patch.scriptText,
      imagery: patch.imageryText,
    };
  });
  const nextChunks = {
    ...parsed.data,
    scenes: nextScenes,
  };
  return JSON.stringify(nextChunks);
}

function patchRunData(
  runData: RunByIdOutput,
  videoId: string,
  sceneDraftsByIndex: SceneDraftsByIndex,
): RunByIdOutput {
  if (!runData?.videos?.length) return runData;
  return {
    ...runData,
    videos: runData.videos.map((video) => {
      if (video.id !== videoId) return video;
      return {
        ...video,
        chunks: patchVideoChunks(video.chunks, sceneDraftsByIndex),
      };
    }),
  };
}

export function useOptimisticScenePatcher(runId: string, videoId: string) {
  const utils = api.useUtils();
  const mutation = api.runs.acceptSceneSuggestions.useMutation({
    onMutate: async (input) => {
      await utils.runs.getById.cancel({ runId: input.runId });
      const previousRunData = utils.runs.getById.getData({ runId: input.runId });
      utils.runs.getById.setData({ runId: input.runId }, (current) => {
        if (!current) return current;
        return patchRunData(current, input.videoId, input.sceneDraftsByIndex);
      });
      return { previousRunData, runId: input.runId };
    },
    onError: (_error, input, context) => {
      if (!context?.previousRunData) return;
      utils.runs.getById.setData(
        { runId: context.runId ?? input.runId },
        context.previousRunData,
      );
    },
    onSettled: (_data, _error, input) => {
      void utils.runs.getById.invalidate({ runId: input.runId });
    },
  });

  const persistSceneDrafts = useCallback(
    (
      sceneDraftsByIndex: SceneDraftsByIndex,
      options?: { onSuccess?: () => void },
    ) => {
      if (!runId || !videoId) return;
      mutation.mutate(
        {
          runId,
          videoId,
          sceneDraftsByIndex,
        },
        {
          onSuccess: () => options?.onSuccess?.(),
        },
      );
    },
    [mutation, runId, videoId],
  );

  return {
    persistSceneDrafts,
    isPending: mutation.isPending,
  };
}
