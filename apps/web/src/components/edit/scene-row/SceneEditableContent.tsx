"use client";

import { Pause, Play } from 'lucide-react';
import { AutosizeTextarea } from '~/components/ui/autosize-textarea';
import { Button } from '~/components/ui/button';
import { useVideoSceneAssetUrls } from '~/hooks/useVideoSceneAssetUrls';
import { expectsSceneAssetsForVideo } from '~/lib/sceneAssetLoading';
import { EMPTY_SCENE_FEEDBACK } from '~/lib/sceneFeedback';
import { useRunStore } from '~/stores/useRunStore';

import { useSceneAudio } from '../hooks/useSceneAudio';
import { useSceneRowMutations } from '../hooks/useSceneRowMutations';

interface SceneEditableContentProps {
  sceneIndex: number;
  sceneText: string;
  sceneImagery: string;
}

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
  const setSceneDraft = useRunStore((s) => s.setSceneDraft);
  const setSceneEditorOpen = useRunStore((s) => s.setSceneEditorOpen);
  const suggestion = useRunStore(
    (s) => s.ui.activeSceneSuggestions?.scenes?.[sceneIndex],
  );
  const feedback = sceneUi?.feedback ?? EMPTY_SCENE_FEEDBACK;
  const isRegenerating = useRunStore((s) => s.ui.sceneUpdating === sceneIndex);
  const { imageUrlByIndex, voiceUrlByIndex } = useVideoSceneAssetUrls({
    runId,
    videoId,
    videoStatus,
  });
  const voiceUrl = voiceUrlByIndex?.[sceneIndex];
  const imageUrl = imageUrlByIndex?.[sceneIndex];
  const scriptText = sceneUi?.draft.scriptText ?? sceneText;
  const imageryText = sceneUi?.draft.imageryText ?? sceneImagery;
  const scriptEditorOpen = sceneUi?.editor.scriptOpen ?? false;
  const imageryEditorOpen = sceneUi?.editor.imageryOpen ?? false;
  const scriptLocked = runPhase === "asset_gen" || runPhase === "export";
  const scriptLineEditable = runPhase === "scripting";
  const imageryEditable = scriptLineEditable || (scriptLocked && !!imageUrl);
  const regenerateAllowed =
    (runPhase === "asset_gen" || runPhase === "export") &&
    (videoStatus === "assets" ||
      videoStatus === "exporting" ||
      videoStatus === "exported");
  const showScriptEditor = scriptLineEditable && !scriptLocked && scriptEditorOpen;
  const showImageryEditor = imageryEditable && imageryEditorOpen;
  const expectsAssetMedia = expectsSceneAssetsForVideo(runPhase, videoStatus);
  const blockingSuggestion =
    !!suggestion &&
    (suggestion.text !== sceneText || suggestion.imagery !== sceneImagery);
  const {
    canRegenerate,
    handleRegenerate,
  } = useSceneRowMutations({
    sceneIndex,
    imageryEditable,
    regenerateAllowed,
    imageryText,
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
    (!voiceUrl || voiceInitialLoadPending) &&
    !showScriptEditor;

  return (
    <>
      <div className="flex items-start gap-2" aria-busy={scriptVoiceShimmer || undefined}>
        {voiceUrl && (
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
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={isPlaying ? "Pause" : "Play scene audio"}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
          </>
        )}
        {showScriptEditor ? (
          <AutosizeTextarea
            value={scriptText}
            onChange={(e) =>
              setSceneDraft(sceneIndex, { scriptText: e.target.value, dirty: true })
            }
            onBlur={() => setSceneEditorOpen(sceneIndex, "scriptOpen", false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSceneEditorOpen(sceneIndex, "scriptOpen", false);
                e.currentTarget.blur();
              }
            }}
            autoFocus
            placeholder="Scene script…"
            className="max-h-80 min-w-0 flex-1 bg-transparent text-sm leading-snug dark:bg-transparent"
          />
        ) : scriptLineEditable && !scriptLocked ? (
          <button
            type="button"
            onClick={() => setSceneEditorOpen(sceneIndex, "scriptOpen", true)}
            className="min-w-0 flex-1 text-left text-sm leading-snug text-foreground"
          >
            {scriptVoiceShimmer ? (
              <span className="text-shimmer-inline">{sceneText}</span>
            ) : (
              sceneText
            )}
          </button>
        ) : (
          <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
            {scriptVoiceShimmer ? (
              <span className="text-shimmer-inline">{sceneText}</span>
            ) : (
              sceneText
            )}
          </p>
        )}
      </div>
      <div>
        {showImageryEditor ? (
          <AutosizeTextarea
            value={imageryText}
            onChange={(e) =>
              setSceneDraft(sceneIndex, { imageryText: e.target.value, dirty: true })
            }
            onBlur={() => setSceneEditorOpen(sceneIndex, "imageryOpen", false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSceneEditorOpen(sceneIndex, "imageryOpen", false);
                e.currentTarget.blur();
              }
            }}
            autoFocus
            placeholder="Image description…"
            className="max-h-80 w-full bg-transparent text-xs dark:bg-transparent"
          />
        ) : imageryEditable ? (
          <button
            type="button"
            onClick={() => setSceneEditorOpen(sceneIndex, "imageryOpen", true)}
            className="w-full text-left text-xs text-muted-foreground"
          >
            {sceneImagery}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{sceneImagery}</p>
        )}
      </div>
      {imageryEditable && regenerateAllowed && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={handleRegenerate}
            disabled={!canRegenerate || isRegenerating}
          >
            {isRegenerating ? "…" : "Regenerate"}
          </Button>
        </div>
      )}
    </>
  );
}
