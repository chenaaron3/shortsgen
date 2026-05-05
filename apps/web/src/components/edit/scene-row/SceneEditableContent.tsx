"use client";

import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useOptimisticScenePatcher } from '~/hooks/useOptimisticScenePatcher';
import { useVideoSceneAssetUrls } from '~/hooks/useVideoSceneAssetUrls';
import { canRegenerateImageryForVideo, expectsSceneAssetsForVideo } from '~/lib/sceneAssetLoading';
import { EMPTY_SCENE_FEEDBACK } from '~/lib/sceneFeedback';
import { useRunStore } from '~/stores/useRunStore';

import { useSceneAudio } from '../hooks/useSceneAudio';
import { useSceneRowMutations } from '../hooks/useSceneRowMutations';
import { EditableField } from './EditableField';

interface SceneEditableContentProps {
  sceneIndex: number;
  sceneText: string;
  sceneImagery: string;
}

const SCRIPT_CLICK =
  "w-full cursor-text rounded-md px-1 py-0.5 text-left text-sm leading-snug text-foreground transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const SCRIPT_READONLY = "min-w-0 flex-1 text-sm leading-snug text-foreground";
const IMAGERY_CLICK =
  "w-full cursor-text rounded-md px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const IMAGERY_READONLY = "text-xs text-muted-foreground";

const SCRIPT_TEXTAREA =
  "max-h-80 min-w-0 flex-1 bg-transparent text-sm leading-snug dark:bg-transparent";
const IMAGERY_TEXTAREA = "max-h-80 w-full bg-transparent text-xs dark:bg-transparent";

export function SceneEditableContent({
  sceneIndex,
  sceneText,
  sceneImagery,
}: SceneEditableContentProps) {
  const runId = useRunStore((s) => s.ui.runId) ?? "";
  const videoId = useRunStore((s) => s.ui.activeVideoId) ?? "";
  const runPhase = useRunStore((s) => s.ui.activeRunPhase) ?? "breakdown";
  const videoStatus = useRunStore((s) => s.ui.activeVideoStatus);
  const sceneUi = useRunStore((s) => s.ui.activeSceneUiByIndex[sceneIndex]);
  const suggestion = useRunStore(
    (s) => s.ui.activeSceneSuggestions?.scenes?.[sceneIndex],
  );
  const feedback = sceneUi?.feedback ?? EMPTY_SCENE_FEEDBACK;
  const isRegenerating = useRunStore((s) => s.ui.sceneUpdating === sceneIndex);
  const { imageUrlByIndex, voiceUrlByIndex } = useVideoSceneAssetUrls({
    runId,
    videoId,
  });
  const voiceUrl = voiceUrlByIndex?.[sceneIndex];
  const imageUrl = imageUrlByIndex?.[sceneIndex];
  const scriptLocked = runPhase === "asset_gen" || runPhase === "export";
  const scriptLineEditable = runPhase === "scripting";
  const imageryEditable = scriptLineEditable || (scriptLocked && !!imageUrl);
  const regenerateAllowed = canRegenerateImageryForVideo(runPhase, videoStatus);
  const expectsAssetMedia = expectsSceneAssetsForVideo(runPhase, videoStatus);
  const blockingSuggestion =
    !!suggestion &&
    (suggestion.text !== sceneText || suggestion.imagery !== sceneImagery);

  const { persistSceneDrafts } = useOptimisticScenePatcher(runId, videoId);

  const persistScript = useCallback(
    (next: string) =>
      persistSceneDrafts({ [String(sceneIndex)]: { scriptText: next } }),
    [persistSceneDrafts, sceneIndex],
  );

  const [committedImageryText, setCommittedImageryText] = useState(sceneImagery);
  useEffect(() => {
    setCommittedImageryText(sceneImagery);
  }, [sceneImagery]);

  const persistImagery = useCallback(
    (next: string) => {
      setCommittedImageryText(next);
      persistSceneDrafts({ [String(sceneIndex)]: { imageryText: next } });
    },
    [persistSceneDrafts, sceneIndex],
  );

  const { canRegenerate, handleRegenerate } = useSceneRowMutations({
    sceneIndex,
    imageryEditable,
    regenerateAllowed,
    imageryText: committedImageryText,
    sceneImagery,
    feedback,
  });
  const {
    audioRef,
    isPlaying,
    handlePlayPause,
    voiceInitialLoadPending,
    setVoiceInitialLoadPending,
  } = useSceneAudio(voiceUrl);

  const scriptVoiceShimmer =
    !blockingSuggestion &&
    expectsAssetMedia &&
    (!voiceUrl || voiceInitialLoadPending);

  const imageryAssetShimmer =
    !blockingSuggestion &&
    expectsAssetMedia &&
    (!imageUrl || isRegenerating);

  return (
    <>
      <div className="flex items-center gap-2" aria-busy={scriptVoiceShimmer || undefined}>
        {voiceUrl ? (
          <>
            <audio
              ref={audioRef}
              src={voiceUrl}
              preload="metadata"
              onLoadedData={() => setVoiceInitialLoadPending(false)}
              onCanPlay={() => setVoiceInitialLoadPending(false)}
              onError={() => setVoiceInitialLoadPending(false)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handlePlayPause}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={isPlaying ? "Pause" : "Play scene audio"}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
          </>
        ) : null}
        <EditableField
          value={sceneText}
          canEdit={scriptLineEditable && !scriptLocked}
          onCommit={persistScript}
          placeholder="Scene script…"
          classNameClickable={SCRIPT_CLICK}
          classNameReadonly={SCRIPT_READONLY}
          classNameTextarea={SCRIPT_TEXTAREA}
          displayShimmer={scriptVoiceShimmer}
        />
      </div>
      <div aria-busy={imageryAssetShimmer || undefined}>
        <EditableField
          value={sceneImagery}
          canEdit={imageryEditable}
          onCommit={persistImagery}
          placeholder="Image description…"
          classNameClickable={IMAGERY_CLICK}
          classNameReadonly={IMAGERY_READONLY}
          classNameTextarea={IMAGERY_TEXTAREA}
          displayShimmer={imageryAssetShimmer}
          displayShimmerTintClass="text-muted-foreground/55"
        />
      </div>
      {imageryEditable && regenerateAllowed && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-xs"
            onClick={handleRegenerate}
            disabled={!canRegenerate || isRegenerating}
            aria-busy={isRegenerating || undefined}
          >
            {isRegenerating ? (
              <>
                <Spinner className="size-3" data-icon="inline-start" aria-hidden />
                Regenerating
              </>
            ) : (
              "Regenerate"
            )}
          </Button>
        </div>
      )}
    </>
  );
}
