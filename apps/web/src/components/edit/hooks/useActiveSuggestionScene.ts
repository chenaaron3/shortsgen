"use client";

import { useEffect, useMemo } from "react";
import { useRunStore } from "~/stores/useRunStore";

interface SceneLike {
  text: string;
  imagery: string;
}

interface SuggestedSceneLike {
  text: string;
  imagery: string;
}

interface UseActiveSuggestionSceneArgs {
  scenes: SceneLike[];
  suggestedScenes: Array<SuggestedSceneLike | undefined>;
}

export function useActiveSuggestionScene({
  scenes,
  suggestedScenes,
}: UseActiveSuggestionSceneArgs) {
  const activeSuggestionSceneIndex = useRunStore(
    (s) => s.ui.activeSuggestionSceneIndex,
  );
  const setActiveSuggestionSceneIndex = useRunStore(
    (s) => s.setActiveSuggestionSceneIndex,
  );

  const blockingSuggestionIndexes = useMemo(() => {
    const indexes: number[] = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i];
      const suggestion = suggestedScenes[i];
      if (!scene || !suggestion) continue;
      if (suggestion.text !== scene.text || suggestion.imagery !== scene.imagery) {
        indexes.push(i);
      }
    }
    return indexes;
  }, [scenes, suggestedScenes]);

  useEffect(() => {
    if (blockingSuggestionIndexes.length === 0) {
      if (activeSuggestionSceneIndex !== null) {
        setActiveSuggestionSceneIndex(null);
      }
      return;
    }

    if (
      activeSuggestionSceneIndex !== null &&
      blockingSuggestionIndexes.includes(activeSuggestionSceneIndex)
    ) {
      return;
    }

    const nextIndex =
      activeSuggestionSceneIndex === null
        ? blockingSuggestionIndexes[0]!
        : blockingSuggestionIndexes.find((idx) => idx > activeSuggestionSceneIndex) ??
          blockingSuggestionIndexes[0]!;
    setActiveSuggestionSceneIndex(nextIndex);
  }, [
    activeSuggestionSceneIndex,
    blockingSuggestionIndexes,
    setActiveSuggestionSceneIndex,
  ]);
}
