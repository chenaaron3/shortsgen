"use client";

import type { ChunksOutput } from "@shortgen/types";
import { expectsSceneAssetsForVideo } from "~/lib/sceneAssetLoading";

import type { RunPhase } from "./RunProgressSteps";
import { ScriptingScenesSkeleton } from "./RunPageSkeleton";
import { SceneRow } from "./SceneRow";

import type { VideoProgress } from "~/stores/useRunStore";

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
  runPhase: RunPhase;
  videoStatus: string | null;
  /** Active WS/pipeline progress for this clip (image finalize, imagery regen, etc.). */
  videoProgress?: VideoProgress | null;
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
  /** When assets exist: scene index -> voice URL for play button */
  voiceUrlByIndex?: Record<number, string>;
}

const SECTIONS = ["Hook", "Body", "Close"] as const;

export function SceneList({
  scenes,
  runId,
  videoId,
  currentChunks,
  runPhase,
  videoStatus,
  videoProgress = null,
  blockAcceptSuggestionField = false,
  scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  sceneUpdating = null,
  imageUrlByIndex,
  voiceUrlByIndex,
}: SceneListProps) {
  if (scenes.length === 0) {
    if (runPhase === "scripting" && videoStatus !== "failed") {
      return <ScriptingScenesSkeleton />;
    }
    return (
      <p className="text-muted-foreground">No scenes yet. Processing…</p>
    );
  }

  const expectsAssetMedia = expectsSceneAssetsForVideo(runPhase, videoStatus);
  const assetPipelineActive = videoProgress != null;

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
                const imageUrl = imageUrlByIndex?.[index];
                const voiceUrl = voiceUrlByIndex?.[index];
                const isRegenerating = sceneUpdating === index;
                const expectImage =
                  isRegenerating ||
                  (!imageUrl && assetPipelineActive && expectsAssetMedia);
                const expectVoice = expectsAssetMedia;
                return (
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
                    isRegenerating={isRegenerating}
                    imageUrl={imageUrl}
                    voiceUrl={voiceUrl}
                    expectImage={expectImage}
                    expectVoice={expectVoice}
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
