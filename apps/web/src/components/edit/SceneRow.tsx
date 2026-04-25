"use client";

import { useRef } from 'react';
import { Card, CardContent } from '~/components/ui/card';
import { HoverBorderGradient } from '~/components/ui/hover-border-gradient';
import { cn } from '~/lib/utils';
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
  const rowRef = useRef<HTMLDivElement | null>(null);
  const activeSuggestionSceneIndex = useRunStore(
    (s) => s.ui.activeSuggestionSceneIndex,
  );
  const setActiveSuggestionSceneIndex = useRunStore(
    (s) => s.setActiveSuggestionSceneIndex,
  );
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
  const isActiveSuggestion =
    blockingSuggestion && activeSuggestionSceneIndex === sceneIndex;

  return (
    <HoverBorderGradient
      containerClassName="rounded-xl"
      duration={1.2}
      disabled={!blockingSuggestion}
      onClick={blockingSuggestion ? () => setActiveSuggestionSceneIndex(sceneIndex) : undefined}
      onKeyDown={
        blockingSuggestion
          ? (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setActiveSuggestionSceneIndex(sceneIndex);
          }
          : undefined
      }
      role={blockingSuggestion ? "button" : undefined}
      tabIndex={blockingSuggestion ? 0 : undefined}
      aria-pressed={blockingSuggestion ? isActiveSuggestion : undefined}
      aria-disabled={blockingSuggestion ? acceptSuggestionPending : undefined}
    >
      <Card
        ref={rowRef}
        size="sm"
        className={cn(
          "py-2 ring-0 transition-all",
          blockingSuggestion &&
          "cursor-pointer border-primary/35 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)] group-hover/hbg:border-primary/50 group-hover/hbg:bg-primary/10 group-hover/hbg:shadow-[0_0_20px_hsl(var(--primary)/0.3)]",
          isActiveSuggestion &&
          "border-primary/60 bg-primary/10 ring-1 ring-primary/45 shadow-[0_0_24px_hsl(var(--primary)/0.45)]",
        )}
      >
        <CardContent className="relative pt-2">
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              {blockingSuggestion && suggestion ? (
                <SceneSuggestionDiff
                  sceneIndex={sceneIndex}
                  sceneText={scene.text}
                  sceneImagery={scene.imagery}
                  suggestedText={suggestion.text}
                  suggestedImagery={suggestion.imagery}
                  isActive={isActiveSuggestion}
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
            <div className="flex shrink-0 flex-col items-end">
              <SceneImagePreview sceneIndex={sceneIndex} />
              {!isActiveSuggestion && (
                <div className="mt-auto shrink-0">
                  <SceneFeedbackControls sceneIndex={sceneIndex} />
                </div>
              )}
            </div>
          </div>
          {isActiveSuggestion && (
            <div className="absolute bottom-2 right-2 z-20">
              <SceneFeedbackControls sceneIndex={sceneIndex} />
            </div>
          )}
        </CardContent>
      </Card>
    </HoverBorderGradient>
  );
}
