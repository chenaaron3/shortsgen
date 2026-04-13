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
      <p className="text-muted-foreground">No scenes yet. Processing…</p>
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
