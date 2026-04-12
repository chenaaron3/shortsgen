"use client";

import { Card, CardContent } from '~/components/ui/card';
import { useRunStore } from '~/stores/useRunStore';
import { SceneEditableContent } from './scene-row/SceneEditableContent';
import { SceneFeedbackControls } from './scene-row/SceneFeedbackControls';
import { SceneImagePreview } from './scene-row/SceneImagePreview';
import { SceneSuggestionDiff } from './scene-row/SceneSuggestionDiff';

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneRowProps {
  scene: Scene;
  sceneIndex: number;
}

export function SceneRow({
  scene,
  sceneIndex,
}: SceneRowProps) {
  const acceptSuggestionPending = useRunStore(
    (s) => s.ui.suggestionDecisionPending,
  );
  const suggestion = useRunStore(
    (s) => s.ui.activeSceneSuggestions?.scenes?.[sceneIndex],
  );

  // blockingSuggestion determines if the current scene has a pending suggestion (text or imagery)
  // that differs from the original scene content, which blocks direct editing until resolved.
  const blockingSuggestion =
    !!suggestion &&
    (suggestion.text !== scene.text || suggestion.imagery !== scene.imagery);

  return (
    <Card size="sm" className="py-2 ring-0">
      <CardContent className="pt-2">
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {blockingSuggestion && suggestion ? (
              <SceneSuggestionDiff
                sceneIndex={sceneIndex}
                sceneText={scene.text}
                sceneImagery={scene.imagery}
                suggestedText={suggestion.text}
                suggestedImagery={suggestion.imagery}
                acceptPending={acceptSuggestionPending}
              />
            ) : (
              <SceneEditableContent
                sceneIndex={sceneIndex}
                sceneText={scene.text}
                sceneImagery={scene.imagery}
              />
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SceneImagePreview sceneIndex={sceneIndex} />
            <div className="mt-auto shrink-0">
              <SceneFeedbackControls sceneIndex={sceneIndex} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
