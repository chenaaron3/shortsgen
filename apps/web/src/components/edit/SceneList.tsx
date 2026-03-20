"use client";

import type { ChunksOutput } from "@shortgen/types";

import { SceneRow } from './SceneRow';

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneListProps {
  scenes: Scene[];
  runId: string;
  videoId: string;
  currentChunks: ChunksOutput;
  blockAcceptSuggestionField?: boolean;
  scriptLocked?: boolean;
  imageryEditable?: boolean;
  onRegenerate?: (
    sceneIndex: number,
    imagery?: string,
    feedback?: string,
  ) => void;
  sceneUpdating?: number | null;
  /** When assets exist: scene index -> image URL for thumbnail */
  imageUrlByIndex?: Record<number, string>;
}

const SECTIONS = ["Hook", "Body", "Close"] as const;

export function SceneList({
  scenes,
  runId,
  videoId,
  currentChunks,
  blockAcceptSuggestionField = false,
  scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  sceneUpdating = null,
  imageUrlByIndex,
}: SceneListProps) {
  if (scenes.length === 0) {
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
              {items.map(({ scene, index }) => (
                <SceneRow
                  key={index}
                  scene={scene}
                  runId={runId}
                  videoId={videoId}
                  sceneIndex={index}
                  currentChunks={currentChunks}
                  blockAcceptSuggestionField={blockAcceptSuggestionField}
                  scriptLocked={scriptLocked}
                  imageryEditable={imageryEditable}
                  onRegenerate={onRegenerate}
                  isRegenerating={sceneUpdating === index}
                  imageUrl={imageUrlByIndex?.[index]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
