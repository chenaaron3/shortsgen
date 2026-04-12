"use client";

import { useCallback } from "react";
import { useOptimisticScenePatcher } from "~/hooks/useOptimisticScenePatcher";
import { useRunStore } from "~/stores/useRunStore";

import type { ChunksOutput } from "@shortgen/types";

interface UseSuggestionFeedbackOptions {
  runId: string;
  videoId: string;
  sceneSuggestions: ChunksOutput | null | undefined;
  onAcceptAllSuccess?: () => void;
}

export function useSuggestionFeedback({
  runId,
  videoId,
  sceneSuggestions,
  onAcceptAllSuccess,
}: UseSuggestionFeedbackOptions) {
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const { persistSceneDrafts, isPending } = useOptimisticScenePatcher(runId, videoId);

  const acceptAllSceneSuggestions = useCallback(() => {
    if (!runId || !videoId || !sceneSuggestions?.scenes?.length) return;
    const sceneDraftsByIndex = sceneSuggestions.scenes.reduce<
      Record<string, { scriptText: string; imageryText: string }>
    >((acc, suggestion, sceneIndex) => {
      if (!suggestion) return acc;
      acc[String(sceneIndex)] = {
        scriptText: suggestion.text,
        imageryText: suggestion.imagery,
      };
      return acc;
    }, {});
    persistSceneDrafts(sceneDraftsByIndex, {
      onSuccess: () => {
        clearSceneSuggestions();
        onAcceptAllSuccess?.();
      },
    });
  }, [
    sceneSuggestions,
    persistSceneDrafts,
    clearSceneSuggestions,
    onAcceptAllSuccess,
  ]);

  const declineSuggestion = useCallback(() => {
    clearSceneSuggestions();
  }, [clearSceneSuggestions]);

  return {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending: isPending,
  };
}
