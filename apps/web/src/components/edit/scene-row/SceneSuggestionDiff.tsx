"use client";

import { Button } from "~/components/ui/button";
import { useOptimisticScenePatcher } from "~/hooks/useOptimisticScenePatcher";
import { useRunStore } from "~/stores/useRunStore";

import { WordDiff } from "../WordDiff";

interface SceneSuggestionDiffProps {
  sceneIndex: number;
  sceneText: string;
  sceneImagery: string;
  suggestedText: string;
  suggestedImagery: string;
  acceptPending: boolean;
}

export function SceneSuggestionDiff({
  sceneIndex,
  sceneText,
  sceneImagery,
  suggestedText,
  suggestedImagery,
  acceptPending,
}: SceneSuggestionDiffProps) {
  const runId = useRunStore((s) => s.ui.runId) ?? "";
  const videoId = useRunStore((s) => s.ui.activeVideoId) ?? "";
  const clearSceneSuggestionAt = useRunStore((s) => s.clearSceneSuggestionAt);
  const { persistSceneDrafts, isPending } = useOptimisticScenePatcher(runId, videoId);

  return (
    <div className="space-y-2">
      <WordDiff before={sceneText} after={suggestedText} variant="script" />
      <WordDiff before={sceneImagery} after={suggestedImagery} variant="imagery" />
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          disabled={acceptPending || isPending}
          onClick={() => {
            persistSceneDrafts(
              {
                [String(sceneIndex)]: {
                  scriptText: suggestedText,
                  imageryText: suggestedImagery,
                },
              },
              {
                onSuccess: () => clearSceneSuggestionAt(sceneIndex),
              },
            );
          }}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          disabled={acceptPending}
          onClick={() => clearSceneSuggestionAt(sceneIndex)}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
