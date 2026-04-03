"use client";

import { useCallback, useEffect, useRef } from "react";
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
  onLoadingStateChange: (state: ScriptingFooterLoadingState) => void;
}

export function ScriptingPhaseFooter({
  runId,
  videoId,
  onLoadingStateChange,
}: ScriptingPhaseFooterProps) {
  const utils = api.useUtils();
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const activeSceneUiByIndex = useRunStore((s) => s.ui.activeSceneUiByIndex);
  const scriptFeedback = useRunStore((s) => s.ui.scriptFeedback);
  const setScriptFeedback = useRunStore((s) => s.setScriptFeedback);
  const setVideoProgress = useRunStore((s) => s.setVideoProgress);
  const setSuggestionDecisionPending = useRunStore(
    (s) => s.setSuggestionDecisionPending,
  );
  const sceneSuggestions = useRunStore((s) => s.ui.activeSceneSuggestions);

  const onLoadingStateChangeRef = useRef(onLoadingStateChange);
  onLoadingStateChangeRef.current = onLoadingStateChange;

  const hasActionableSuggestions = sceneSuggestions !== null;

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
  });

  const handleApplyFeedback = useCallback(() => {
    if (!runId || !videoId) return;
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
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">
            Revision ready — accept or decline
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={acceptAllSceneSuggestions}
              disabled={isDecisionPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isDecisionPending ? "Accepting…" : "Accept all suggestions"}
            </button>
            <button
              type="button"
              onClick={declineSuggestion}
              disabled={isDecisionPending}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <ScriptFeedbackSection
          onApplyFeedback={handleApplyFeedback}
          disabled={updateFeedbackMutation.isPending}
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
