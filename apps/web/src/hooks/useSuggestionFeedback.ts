"use client";

import { useCallback } from "react";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

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
  const utils = api.useUtils();
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const persistAllSuggestionsMutation = api.runs.acceptSceneSuggestions.useMutation({
    onSuccess: () => {
      clearSceneSuggestions();
      if (runId) {
        void utils.runs.getById.invalidate({ runId });
      }
      onAcceptAllSuccess?.();
    },
  });

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
    persistAllSuggestionsMutation.mutate({
      runId,
      videoId,
      sceneDraftsByIndex,
    });
  }, [
    runId,
    videoId,
    sceneSuggestions,
    persistAllSuggestionsMutation,
  ]);

  const declineSuggestion = useCallback(() => {
    clearSceneSuggestions();
  }, [clearSceneSuggestions]);

  return {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending: persistAllSuggestionsMutation.isPending,
  };
}
