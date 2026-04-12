"use client";

import { Button } from "~/components/ui/button";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

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
  const utils = api.useUtils();
  const runId = useRunStore((s) => s.ui.runId) ?? "";
  const videoId = useRunStore((s) => s.ui.activeVideoId) ?? "";
  const clearSceneSuggestionAt = useRunStore((s) => s.clearSceneSuggestionAt);
  const persistSceneMutation = api.runs.acceptSceneSuggestions.useMutation({
    onSuccess: () => {
      if (runId) {
        void utils.runs.getById.invalidate({ runId });
      }
      clearSceneSuggestionAt(sceneIndex);
    },
  });

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
          disabled={acceptPending || persistSceneMutation.isPending}
          onClick={() => {
            if (!runId || !videoId) return;
            persistSceneMutation.mutate({
              runId,
              videoId,
              sceneDraftsByIndex: {
                [String(sceneIndex)]: {
                  scriptText: suggestedText,
                  imageryText: suggestedImagery,
                },
              },
            });
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
