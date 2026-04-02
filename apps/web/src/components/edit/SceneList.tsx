"use client";

import type { ChunksOutput } from "@shortgen/types";
import { useVideoSceneAssetUrls } from "~/hooks/useVideoSceneAssetUrls";
import { expectsSceneAssetsForVideo } from "~/lib/sceneAssetLoading";
import { useRunStore } from "~/stores/useRunStore";

import type { RunPhase } from "./RunProgressSteps";
import { ScriptingScenesSkeleton } from "./RunPageSkeleton";
import { SceneRow } from "./SceneRow";

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneListProps {
  runId: string;
  videoId: string;
  scenes: Scene[];
  currentChunks: ChunksOutput;
  runPhase: RunPhase;
  videoStatus: string | null;
  /** Parent “accept all” in flight — disables per-field Accept. */
  blockAcceptSuggestionField?: boolean;
  onRegenerate?: (
    sceneIndex: number,
    imagery?: string,
    feedback?: string,
  ) => void;
}

const SECTIONS = ["Hook", "Body", "Close"] as const;

export function SceneList({
  runId,
  videoId,
  scenes,
  currentChunks,
  runPhase,
  videoStatus,
  blockAcceptSuggestionField = false,
  onRegenerate,
}: SceneListProps) {
  const sceneUpdating = useRunStore((s) => s.progress.sceneUpdating);
  const videoProgress = useRunStore(
    (s) => s.progress.videoProgressByVideo[videoId],
  );

  const scriptLocked = runPhase === "asset_gen" || runPhase === "export";
  const inAssetPhase = scriptLocked;
  const scriptLineEditable = runPhase === "scripting";

  const { imageUrlByIndex, voiceUrlByIndex } = useVideoSceneAssetUrls({
    runId,
    videoId,
    runPhase,
    videoStatus,
  });

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
                const expectImage =
                  sceneUpdating === index ||
                  (!imageUrl && assetPipelineActive && expectsAssetMedia);
                const expectVoice = expectsAssetMedia;
                const rowImageryEditable =
                  scriptLineEditable || (inAssetPhase && !!imageUrl);
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
                    scriptLineEditable={scriptLineEditable}
                    imageryEditable={rowImageryEditable}
                    onRegenerate={onRegenerate}
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
