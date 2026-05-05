"use client";

import { useRunStore } from '~/stores/useRunStore';

import { useActiveSuggestionScene } from './hooks/useActiveSuggestionScene';
import { ScriptingScenesSkeleton } from './RunPageSkeleton';
import { SceneRow } from './SceneRow';

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneListProps {
  scenes: Scene[];
}

const SECTIONS = ["Hook", "Body", "Close"] as const;
const EMPTY_SUGGESTED_SCENES: Array<{ text: string; imagery: string } | undefined> = [];

export function SceneList({
  scenes,
}: SceneListProps) {
  const runPhase = useRunStore((s) => s.ui.activeRunPhase) ?? "breakdown";
  const videoStatus = useRunStore((s) => s.ui.activeVideoStatus);
  const suggestedScenes = useRunStore(
    (s) => s.ui.activeSceneSuggestions?.scenes ?? EMPTY_SUGGESTED_SCENES,
  );

  useActiveSuggestionScene({ scenes, suggestedScenes });

  if (scenes.length === 0) {
    if (runPhase === "scripting" && videoStatus !== "failed") {
      return <ScriptingScenesSkeleton />;
    }
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">Preparing scenes…</span>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Analyzing your video
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;re detecting scenes and preparing the script. This usually takes a
            moment.
          </p>
        </div>
        <ScriptingScenesSkeleton rowCount={3} />
      </div>
    );
  }

  const grouped = scenes.reduce(
    (acc, scene, i) => {
      const section = SECTIONS.includes(scene.section as (typeof SECTIONS)[number])
        ? (scene.section as (typeof SECTIONS)[number])
        : "Body";
      if (!acc[section]) acc[section] = [];
      acc[section].push({ scene, index: i });
      return acc;
    },
    {} as Record<(typeof SECTIONS)[number], { scene: Scene; index: number }[]>,
  );

  return (
    <div className="space-y-2">
      {SECTIONS.map((section) => {
        const items = grouped[section];
        if (!items?.length) return null;
        return (
          <div key={section}>
            <h2 className="pt-4 text-base font-semibold text-foreground first:pt-0">
              {section}
            </h2>
            <div className="mt-2 space-y-2">
              {items.map(({ scene, index }) => {
                return (
                  <SceneRow
                    key={index}
                    scene={scene}
                    sceneIndex={index}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
