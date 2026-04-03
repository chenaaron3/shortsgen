"use client";

import { useCallback, useMemo } from "react";
import { sceneFeedbackToApiString } from "~/lib/sceneFeedback";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";
import type { SceneFeedback } from "~/lib/sceneFeedback";

interface UseSceneRowMutationsOptions {
  sceneIndex: number;
  imageryEditable: boolean;
  regenerateAllowed: boolean;
  imageryText: string;
  sceneImagery: string;
  feedback: SceneFeedback;
}

export function useSceneRowMutations({
  sceneIndex,
  imageryEditable,
  regenerateAllowed,
  imageryText,
  sceneImagery,
  feedback,
}: UseSceneRowMutationsOptions) {
  const variationFeedback = "Generate a different visual variation from the current image.";
  const runId = useRunStore((s) => s.ui.runId);
  const videoId = useRunStore((s) => s.ui.activeVideoId);
  const acceptSuggestionPending = useRunStore(
    (s) => s.ui.suggestionDecisionPending,
  );
  const setSceneUpdating = useRunStore((s) => s.setSceneUpdating);
  const setVideoProgress = useRunStore((s) => s.setVideoProgress);
  const utils = api.useUtils();
  const updateImageryMutation = api.runs.updateImagery.useMutation({
    onSuccess: (_, variables) => {
      setVideoProgress(variables.videoId, {
        workflow: "update_imagery",
        type: "request_sent",
        progress: 0,
        statusMessage: "Starting…",
      });
      void utils.runs.getById.invalidate({ runId: variables.runId });
    },
    onError: () => setSceneUpdating(null),
  });

  const hasSceneFeedback = useMemo(
    () => sceneFeedbackToApiString(feedback).length > 0,
    [feedback],
  );

  const canRegenerate =
    regenerateAllowed &&
    imageryEditable &&
    !!runId &&
    !!videoId &&
    (imageryText.trim().length > 0 || hasSceneFeedback);

  const handleRegenerate = useCallback(() => {
    if (!runId || !videoId || !canRegenerate) return;
    setSceneUpdating(sceneIndex);
    if (imageryText.trim() !== sceneImagery.trim()) {
      updateImageryMutation.mutate({
        runId,
        videoId,
        sceneIndex,
        imagery: imageryText.trim(),
      });
    } else if (hasSceneFeedback) {
      updateImageryMutation.mutate({
        runId,
        videoId,
        sceneIndex,
        feedback: sceneFeedbackToApiString(feedback),
      });
    } else {
      updateImageryMutation.mutate({
        runId,
        videoId,
        sceneIndex,
        feedback: variationFeedback,
      });
    }
  }, [
    canRegenerate,
    imageryText,
    sceneImagery,
    sceneIndex,
    hasSceneFeedback,
    feedback,
    variationFeedback,
    runId,
    videoId,
    setSceneUpdating,
    updateImageryMutation,
  ]);

  return {
    acceptSuggestionPending,
    canRegenerate,
    handleRegenerate,
  };
}
