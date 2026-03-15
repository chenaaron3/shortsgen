"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChunksOutput } from "@shortgen/types";
import { api } from "~/utils/api";

export type SuggestionDecisions = Record<
  number,
  { text?: "accept" | "decline"; imagery?: "accept" | "decline" }
>;

interface SceneLike {
  text: string;
  imagery: string;
  section?: string;
  [key: string]: unknown;
}

interface UseSuggestionFeedbackOptions {
  runId: string;
  videoId: string;
  feedbackPartial: ChunksOutput | null | undefined;
  scenes: SceneLike[];
  onAcceptSuccess?: () => void;
  onDeclineSuccess?: () => void;
}

export function useSuggestionFeedback({
  runId,
  videoId,
  feedbackPartial,
  scenes,
  onAcceptSuccess,
  onDeclineSuccess,
}: UseSuggestionFeedbackOptions) {
  const [suggestionDecisions, setSuggestionDecisions] = useState<SuggestionDecisions>({});

  useEffect(() => {
    setSuggestionDecisions({});
  }, [feedbackPartial]);

  const acceptFeedbackMutation = api.runs.acceptFeedbackChunks.useMutation({
    onSuccess: onAcceptSuccess,
  });

  const onSuggestionDecision = useCallback(
    (sceneIndex: number, field: "text" | "imagery", decision: "accept" | "decline") => {
      setSuggestionDecisions((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          [field]: decision,
        },
      }));
    },
    [],
  );

  const acceptSuggestion = useCallback(() => {
    if (!runId || !videoId || !feedbackPartial?.scenes) return;
    const sugScenes = feedbackPartial.scenes;
    const mergedScenes = scenes.map((current, i) => {
      const sug = sugScenes[i];
      const dec = suggestionDecisions[i];
      return {
        ...current,
        text: dec?.text === "accept" && sug ? sug.text : current.text,
        imagery: dec?.imagery === "accept" && sug ? sug.imagery : current.imagery,
      };
    });
    acceptFeedbackMutation.mutate({
      runId,
      videoId,
      chunks: { ...feedbackPartial, scenes: mergedScenes } as ChunksOutput,
    });
  }, [
    runId,
    videoId,
    feedbackPartial,
    scenes,
    suggestionDecisions,
    acceptFeedbackMutation,
  ]);

  const declineSuggestion = useCallback(() => {
    setSuggestionDecisions({});
    onDeclineSuccess?.();
  }, [onDeclineSuccess]);

  return {
    suggestionDecisions,
    onSuggestionDecision,
    acceptSuggestion,
    declineSuggestion,
    isDecisionPending: acceptFeedbackMutation.isPending,
  };
}
