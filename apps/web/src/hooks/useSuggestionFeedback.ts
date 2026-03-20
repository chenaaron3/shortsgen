"use client";

import { useCallback } from "react";
import { api } from "~/utils/api";
import { mergeAllSceneSuggestions } from "~/lib/suggestionMerge";
import { useRunStore } from "~/stores/useRunStore";

import type { ChunksOutput } from "@shortgen/types";

interface UseSuggestionFeedbackOptions {
  runId: string;
  videoId: string;
  currentChunks: ChunksOutput;
  sceneSuggestions: ChunksOutput | null | undefined;
  onAcceptAllSuccess?: () => void;
}

export function useSuggestionFeedback({
  runId,
  videoId,
  currentChunks,
  sceneSuggestions,
  onAcceptAllSuccess,
}: UseSuggestionFeedbackOptions) {
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const acceptSceneSuggestionsMutation =
    api.runs.acceptSceneSuggestions.useMutation();

  const acceptAllSceneSuggestions = useCallback(() => {
    if (!runId || !videoId || !sceneSuggestions?.scenes) return;
    const chunks = mergeAllSceneSuggestions(currentChunks, sceneSuggestions);
    acceptSceneSuggestionsMutation.mutate(
      { runId, videoId, chunks },
      { onSuccess: onAcceptAllSuccess },
    );
  }, [
    runId,
    videoId,
    currentChunks,
    sceneSuggestions,
    acceptSceneSuggestionsMutation,
    onAcceptAllSuccess,
  ]);

  const declineSuggestion = useCallback(() => {
    clearSceneSuggestions(videoId);
  }, [videoId, clearSceneSuggestions]);

  return {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending: acceptSceneSuggestionsMutation.isPending,
  };
}
