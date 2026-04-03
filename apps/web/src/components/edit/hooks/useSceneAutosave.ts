"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

interface UseSceneAutosaveOptions {
  runId: string;
  videoId: string;
  scriptLineEditable: boolean;
  blockingSuggestion: boolean;
  scriptText: string;
  imageryText: string;
  sceneText: string;
  sceneImagery: string;
}

export function useSceneAutosave({
  runId,
  videoId,
  scriptLineEditable,
  blockingSuggestion,
  scriptText,
  imageryText,
  sceneText,
  sceneImagery,
}: UseSceneAutosaveOptions) {
  const utils = api.useUtils();
  const persistChunksMutation = api.runs.acceptSceneSuggestions.useMutation({
    onSuccess: () => {
      void utils.runs.getById.invalidate({ runId });
    },
  });
  const persistDraftState = useCallback(() => {
    const activeSceneUiByIndex = useRunStore.getState().ui.activeSceneUiByIndex;
    const sceneDraftsByIndex = Object.entries(activeSceneUiByIndex).reduce<
      Record<string, { scriptText: string; imageryText: string }>
    >((acc, [index, sceneUi]) => {
      if (!sceneUi?.draft) return acc;
      acc[index] = {
        scriptText: sceneUi.draft.scriptText,
        imageryText: sceneUi.draft.imageryText,
      };
      return acc;
    }, {});
    persistChunksMutation.mutate({
      runId,
      videoId,
      sceneDraftsByIndex,
    });
  }, [persistChunksMutation.mutate, runId, videoId]);
  const lastPersistedDraftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scriptLineEditable || blockingSuggestion) return;
    if (scriptText === sceneText && imageryText === sceneImagery) {
      lastPersistedDraftKeyRef.current = null;
      return;
    }
    if (persistChunksMutation.isPending) return;
    const draftKey = `${scriptText}\u0000${imageryText}`;
    if (lastPersistedDraftKeyRef.current === draftKey) return;

    const id = window.setTimeout(() => {
      lastPersistedDraftKeyRef.current = draftKey;
      persistDraftState();
    }, 450);

    return () => window.clearTimeout(id);
  }, [
    scriptLineEditable,
    blockingSuggestion,
    scriptText,
    imageryText,
    sceneText,
    sceneImagery,
    persistChunksMutation.isPending,
    persistDraftState,
  ]);
}
