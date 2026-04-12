"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from 'lucide-react';
import { AutosizeTextarea } from '~/components/ui/autosize-textarea';
import { Button } from '~/components/ui/button';
import { useOptimisticScenePatcher } from '~/hooks/useOptimisticScenePatcher';
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
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false);
  const [imageryEditorOpen, setImageryEditorOpen] = useState(false);
  const [committedScriptText, setCommittedScriptText] = useState(sceneText);
  const [committedImageryText, setCommittedImageryText] = useState(sceneImagery);
  const [scriptDraft, setScriptDraft] = useState(sceneText);
  const [imageryDraft, setImageryDraft] = useState(sceneImagery);
  const cancelScriptOnBlurRef = useRef(false);
  const cancelImageryOnBlurRef = useRef(false);
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
  const { persistSceneDrafts } = useOptimisticScenePatcher(runId, videoId);

  useEffect(() => {
    if (!scriptEditorOpen) {
      setCommittedScriptText(sceneText);
      setScriptDraft(sceneText);
    }
  }, [sceneText, scriptEditorOpen]);

  useEffect(() => {
    if (!imageryEditorOpen) {
      setCommittedImageryText(sceneImagery);
      setImageryDraft(sceneImagery);
    }
  }, [sceneImagery, imageryEditorOpen]);

  const persistScene = useCallback(
    (nextScriptText: string, nextImageryText: string) => {
      persistSceneDrafts({
        [String(sceneIndex)]: {
          scriptText: nextScriptText,
          imageryText: nextImageryText,
        },
      });
    },
    [persistSceneDrafts, sceneIndex],
  );

  const openScriptEditor = useCallback(() => {
    setScriptDraft(committedScriptText);
    setScriptEditorOpen(true);
  }, [committedScriptText]);

  const openImageryEditor = useCallback(() => {
    setImageryDraft(committedImageryText);
    setImageryEditorOpen(true);
  }, [committedImageryText]);

  const closeScriptEditor = useCallback(() => {
    setScriptEditorOpen(false);
    if (cancelScriptOnBlurRef.current) {
      cancelScriptOnBlurRef.current = false;
      setScriptDraft(committedScriptText);
      return;
    }
    if (scriptDraft === committedScriptText) return;
    setCommittedScriptText(scriptDraft);
    persistScene(scriptDraft, committedImageryText);
  }, [scriptDraft, committedScriptText, committedImageryText, persistScene]);

  const closeImageryEditor = useCallback(() => {
    setImageryEditorOpen(false);
    if (cancelImageryOnBlurRef.current) {
      cancelImageryOnBlurRef.current = false;
      setImageryDraft(committedImageryText);
      return;
    }
    if (imageryDraft === committedImageryText) return;
    setCommittedImageryText(imageryDraft);
    persistScene(committedScriptText, imageryDraft);
  }, [imageryDraft, committedImageryText, committedScriptText, persistScene]);

  const scriptText = showScriptEditor ? scriptDraft : committedScriptText;
  const imageryText = showImageryEditor ? imageryDraft : committedImageryText;
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
            value={scriptDraft}
            onChange={(e) => setScriptDraft(e.target.value)}
            onBlur={closeScriptEditor}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                closeScriptEditor();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelScriptOnBlurRef.current = true;
                closeScriptEditor();
              }
            }}
            autoFocus
            placeholder="Scene script…"
            className="max-h-80 min-w-0 flex-1 bg-transparent text-sm leading-snug dark:bg-transparent"
          />
        ) : scriptLineEditable && !scriptLocked ? (
          <button
            type="button"
            onClick={openScriptEditor}
            className="min-w-0 flex-1 text-left text-sm leading-snug text-foreground transition-colors hover:underline cursor-text"
          >
            {scriptVoiceShimmer ? (
              <span className="text-shimmer-inline">{scriptText}</span>
            ) : (
              scriptText
            )}
          </button>
        ) : (
          <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
            {scriptVoiceShimmer ? (
              <span className="text-shimmer-inline">{scriptText}</span>
            ) : (
              scriptText
            )}
          </p>
        )}
      </div>
      <div>
        {showImageryEditor ? (
          <AutosizeTextarea
            value={imageryDraft}
            onChange={(e) => setImageryDraft(e.target.value)}
            onBlur={closeImageryEditor}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                closeImageryEditor();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelImageryOnBlurRef.current = true;
                closeImageryEditor();
              }
            }}
            autoFocus
            placeholder="Image description…"
            className="max-h-80 w-full bg-transparent text-xs dark:bg-transparent"
          />
        ) : imageryEditable ? (
          <button
            type="button"
            onClick={openImageryEditor}
            className="w-full text-left text-xs text-muted-foreground transition-colors hover:underline cursor-text"
          >
            {imageryText}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{imageryText}</p>
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
