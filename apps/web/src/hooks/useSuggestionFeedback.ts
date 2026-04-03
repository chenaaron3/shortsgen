"use client";

import { useCallback } from "react";
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
  videoId: _videoId,
  sceneSuggestions,
  onAcceptAllSuccess,
}: UseSuggestionFeedbackOptions) {
  const setSceneDraft = useRunStore((s) => s.setSceneDraft);
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);

  const acceptAllSceneSuggestions = useCallback(() => {
    if (!runId || !sceneSuggestions?.scenes?.length) return;
    sceneSuggestions.scenes.forEach((sug, sceneIndex) => {
      const suggestion = sug;
      if (!suggestion) return;
      setSceneDraft(sceneIndex, {
        scriptText: suggestion.text,
        imageryText: suggestion.imagery,
        dirty: true,
      });
    });
    clearSceneSuggestions();
    onAcceptAllSuccess?.();
  }, [
    runId,
    sceneSuggestions,
    setSceneDraft,
    clearSceneSuggestions,
    onAcceptAllSuccess,
  ]);

  const declineSuggestion = useCallback(() => {
    clearSceneSuggestions();
  }, [clearSceneSuggestions]);

  return {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending: false,
  };
}
