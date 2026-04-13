"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSuggestionFeedback } from "~/hooks/useSuggestionFeedback";
import { sceneFeedbackToApiString } from "~/lib/sceneFeedback";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

import { ScriptFeedbackSection } from "./ScriptFeedbackSection";

export interface ScriptingFooterLoadingState {
  decisionPending: boolean;
  feedbackPending: boolean;
}

interface ScriptingPhaseFooterProps {
  runId: string;
  videoId: string;
  scenes: Array<{ text: string; imagery: string }>;
  onLoadingStateChange: (state: ScriptingFooterLoadingState) => void;
}

export function ScriptingPhaseFooter({
  runId,
  videoId,
  scenes,
  onLoadingStateChange,
}: ScriptingPhaseFooterProps) {
  const utils = api.useUtils();
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const activeSceneUiByIndex = useRunStore((s) => s.ui.activeSceneUiByIndex);
  const scriptFeedback = useRunStore((s) => s.ui.scriptFeedback);
  const setScriptFeedback = useRunStore((s) => s.setScriptFeedback);
  const setVideoProgress = useRunStore((s) => s.setVideoProgress);
  const activeSuggestionSceneIndex = useRunStore(
    (s) => s.ui.activeSuggestionSceneIndex,
  );
  const setSuggestionDecisionPending = useRunStore(
    (s) => s.setSuggestionDecisionPending,
  );
  const feedbackLocked = useRunStore((s) => s.ui.feedbackLocked);
  const setFeedbackLocked = useRunStore((s) => s.setFeedbackLocked);
  const sceneSuggestions = useRunStore((s) => s.ui.activeSceneSuggestions);

  const onLoadingStateChangeRef = useRef(onLoadingStateChange);
  onLoadingStateChangeRef.current = onLoadingStateChange;

  const actionableSuggestionIndexes = useMemo(() => {
    if (!sceneSuggestions) return [] as number[];
    const indexes: number[] = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const currentScene = scenes[i];
      const suggestion = sceneSuggestions.scenes[i];
      if (!currentScene || !suggestion) continue;
      if (
        suggestion.text !== currentScene.text ||
        suggestion.imagery !== currentScene.imagery
      ) {
        indexes.push(i);
      }
    }
    return indexes;
  }, [sceneSuggestions, scenes]);
  const hasActionableSuggestions = actionableSuggestionIndexes.length > 0;
  const reviewCount = actionableSuggestionIndexes.length;
  const activeReviewPosition =
    activeSuggestionSceneIndex === null
      ? null
      : actionableSuggestionIndexes.indexOf(activeSuggestionSceneIndex);
  const hasActiveReviewPosition =
    activeReviewPosition !== null && activeReviewPosition >= 0;

  const onAcceptAllSuccess = useCallback(() => {
    clearSceneSuggestions();
    void utils.runs.getById.invalidate({ runId });
  }, [clearSceneSuggestions, runId, utils]);

  const {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending,
  } = useSuggestionFeedback({
    runId,
    videoId,
    sceneSuggestions,
    onAcceptAllSuccess,
  });

  const updateFeedbackMutation = api.runs.updateClipFeedback.useMutation({
    onSuccess: (_, variables) => {
      setScriptFeedback("");
      setVideoProgress(variables.videoId, {
        workflow: "update_feedback",
        type: "request_sent",
        progress: 0,
        statusMessage: "Starting…",
      });
    },
    onError: () => {
      setFeedbackLocked(false);
    },
  });

  const handleApplyFeedback = useCallback(() => {
    if (!runId || !videoId || feedbackLocked) return;
    const sceneFeedbackArray = activeSceneUiByIndex
      ? Object.entries(activeSceneUiByIndex)
        .map(([k, v]) => {
          const s = sceneFeedbackToApiString(v.feedback);
          return s.trim().length > 0
            ? { sceneIndex: Number(k), feedback: s }
            : null;
        })
        .filter((x): x is { sceneIndex: number; feedback: string } => x !== null)
      : undefined;
    setFeedbackLocked(true);
    updateFeedbackMutation.mutate({
      runId,
      videoId,
      scriptFeedback: scriptFeedback.trim() || undefined,
      sceneFeedback: sceneFeedbackArray,
    });
  }, [
    runId,
    videoId,
    activeSceneUiByIndex,
    feedbackLocked,
    setFeedbackLocked,
    scriptFeedback,
    updateFeedbackMutation,
  ]);

  useEffect(() => {
    setSuggestionDecisionPending(isDecisionPending);
    onLoadingStateChangeRef.current({
      decisionPending: isDecisionPending,
      feedbackPending: updateFeedbackMutation.isPending,
    });
  }, [
    isDecisionPending,
    updateFeedbackMutation.isPending,
    setSuggestionDecisionPending,
  ]);

  useEffect(() => {
    return () => {
      setSuggestionDecisionPending(false);
      onLoadingStateChangeRef.current({
        decisionPending: false,
        feedbackPending: false,
      });
    };
  }, [setSuggestionDecisionPending]);

  return (
    <footer className="shrink-0 bg-background px-6 py-4">
      {hasActionableSuggestions ? (
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium text-foreground">
            {reviewCount} suggestion{reviewCount === 1 ? "" : "s"} left to review
          </span>
          <div className="ml-2 flex items-center gap-2">
            <button
              type="button"
              onClick={acceptAllSceneSuggestions}
              disabled={isDecisionPending}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isDecisionPending ? "Accepting…" : "Accept all"}
            </button>
            <button
              type="button"
              onClick={declineSuggestion}
              disabled={isDecisionPending}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              Decline all
            </button>
          </div>
        </div>
      ) : (
        <ScriptFeedbackSection
          onApplyFeedback={handleApplyFeedback}
          disabled={updateFeedbackMutation.isPending || feedbackLocked}
          error={
            updateFeedbackMutation.isError
              ? updateFeedbackMutation.error?.message ?? null
              : null
          }
        />
      )}
    </footer>
  );
}
