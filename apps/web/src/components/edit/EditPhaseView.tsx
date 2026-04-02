"use client";

import { useCallback, useEffect, useMemo } from 'react';
import { Badge } from '~/components/ui/badge';
import { useExportProgressPolling } from '~/hooks/useExportProgressPolling';
import { useSuggestionFeedback } from '~/hooks/useSuggestionFeedback';
import { getVideoDisplayName, parseVideoChunks } from '~/lib/parseVideoChunks';
import { sceneFeedbackToApiString } from '~/lib/sceneFeedback';
import { hasActionableSceneSuggestions } from '~/lib/suggestionMerge';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { EditRunHeader } from './EditRunHeader';
import { RawScriptCard } from './RawScriptCard';
import { RunLogsModal } from './RunLogsModal';
import { MainContentSkeleton } from './RunPageSkeleton';
import { SceneList } from './SceneList';
import { ScriptFeedbackSection } from './ScriptFeedbackSection';
import { VideoPreview } from './VideoPreview';
import { VideoSidebar } from './VideoSidebar';

import type { RunPhase } from "./RunProgressSteps";
import type { RouterOutputs } from "~/utils/api";
type RunWithVideos = NonNullable<RouterOutputs["runs"]["getById"]>;

interface EditPhaseViewProps {
  runData: RunWithVideos;
  videoId: string;
  wsStatus: string;
  wsCloseInfo?: { code: number; reason: string } | null;
}

export function EditPhaseView({ runData, videoId, wsStatus, wsCloseInfo }: EditPhaseViewProps) {
  const runId = runData.id;

  const runQuery = api.runs.getById.useQuery({ runId });
  const isAdminQuery = api.admin.isAdmin.useQuery();

  const { setSceneUpdating, setVideoUpdating, setScriptFeedback, setVideoProgress } =
    useRunStore();

  const sourceTextByVideo = useRunStore((s) => s.ui.sourceTextByVideo);
  const feedbackByVideo = useRunStore((s) => s.feedback.feedbackByVideo);
  const scriptFeedback = useRunStore((s) => s.feedback.scriptFeedback);
  const breakdownComplete = useRunStore((s) => s.progress.breakdownComplete);
  const videoUpdating = useRunStore((s) => s.progress.videoUpdating);
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);
  const logsModalOpen = useRunStore((s) => s.ui.logsModalOpen);

  const videos = runData.videos ?? [];
  const selectedVideo = videos.find((v) => v.id === videoId);

  const { currentChunks, scenes, description } = useMemo(
    () => parseVideoChunks(selectedVideo?.chunks),
    [selectedVideo?.chunks],
  );
  const sourceText = selectedVideo
    ? (sourceTextByVideo[selectedVideo.id] ?? selectedVideo.source_text ?? "")
    : "";
  const sceneSuggestions = useRunStore((s) => s.progress.sceneSuggestionsByVideo[videoId]);
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const effectiveBreakdownComplete = breakdownComplete || videos.length > 0;

  const hasActionableSuggestions = useMemo(
    () => hasActionableSceneSuggestions(currentChunks, sceneSuggestions),
    [currentChunks, sceneSuggestions],
  );

  useEffect(() => {
    if (!sceneSuggestions || !currentChunks.scenes.length) return;
    if (!hasActionableSuggestions) {
      clearSceneSuggestions(videoId);
    }
  }, [
    sceneSuggestions,
    hasActionableSuggestions,
    currentChunks.scenes.length,
    videoId,
    clearSceneSuggestions,
  ]);

  const videoStatusKey = useMemo(
    () => videos.map((v) => `${v.id}:${v.status ?? ""}`).join("|"),
    [videos],
  );

  useEffect(() => {
    for (const v of videos) {
      if (v.status === "exported") {
        setVideoProgress(v.id, null);
      }
    }
  }, [videoStatusKey, videos, setVideoProgress]);

  const onAcceptAllSuccess = useCallback(() => {
    clearSceneSuggestions(videoId);
    void runQuery.refetch();
  }, [videoId, clearSceneSuggestions, runQuery]);

  const {
    acceptAllSceneSuggestions,
    declineSuggestion,
    isDecisionPending,
  } = useSuggestionFeedback({
    runId,
    videoId,
    currentChunks,
    sceneSuggestions,
    onAcceptAllSuccess,
  });

  const updateFeedbackMutation = api.runs.updateClipFeedback.useMutation({
    onSuccess: (_, variables) => {
      setScriptFeedback("");
      setVideoProgress(variables.videoId, {
        workflow: "update_feedback",
        type: "request_sent",
        progress: 0,
        statusMessage: "Starting…",
      });
    },
  });
  const finalizeAllMutation = api.runs.finalizeAll.useMutation({
    onSuccess: () => {
      setVideoUpdating(true);
      videos
        .filter((v) => v.status === "scripts")
        .forEach((v) =>
          setVideoProgress(v.id, {
            workflow: "finalize_clip",
            type: "request_sent",
            progress: 0,
            statusMessage: "Starting…",
          })
        );
      void runQuery.refetch();
    },
  });
  const triggerExportMutation = api.runs.triggerExport.useMutation({
    onSuccess: () => {
      videos
        .filter((v) => v.status === "assets")
        .forEach((v) =>
          setVideoProgress(v.id, {
            workflow: "export",
            statusMessage: "Rendering…",
          }),
        );
      void runQuery.refetch();
    },
  });

  useExportProgressPolling(runId, videos, () => void runQuery.refetch());
  const updateImageryMutation = api.runs.updateImagery.useMutation({
    onSuccess: (_, variables) => {
      setVideoProgress(variables.videoId, {
        workflow: "update_imagery",
        type: "request_sent",
        progress: 0,
        statusMessage: "Starting…",
      });
    },
    onError: () => setSceneUpdating(null),
  });

  const runPhase: RunPhase = (runData.status ?? "breakdown") as RunPhase;

  const allVideosHaveScripts =
    videos.length > 0 && videos.every((v) => v.status === "scripts");
  const canShowNextButton =
    runPhase === "scripting" &&
    allVideosHaveScripts &&
    !videoUpdating &&
    !finalizeAllMutation.isPending;
  const allVideosHaveAssets =
    videos.length > 0 && videos.every((v) => v.status === "assets");
  const allVideosExported =
    runPhase === "export" &&
    videos.length > 0 &&
    videos.every((v) => v.status === "exported");
  const hasExportableVideos = videos.some((v) => v.status === "assets");
  const canShowExportButton =
    ((runPhase === "asset_gen" && allVideosHaveAssets) ||
      (runPhase === "export" && hasExportableVideos)) &&
    !triggerExportMutation.isPending;

  const handleApplyFeedback = useCallback(() => {
    if (!runId || !videoId) return;
    const fb = feedbackByVideo[videoId];
    const sceneFeedbackArray = fb?.sceneFeedback
      ? Object.entries(fb.sceneFeedback)
        .map(([k, v]) => {
          const s = sceneFeedbackToApiString(v);
          return s.trim().length > 0
            ? { sceneIndex: Number(k), feedback: s }
            : null;
        })
        .filter((x): x is { sceneIndex: number; feedback: string } => x !== null)
      : undefined;
    updateFeedbackMutation.mutate({
      runId,
      videoId,
      scriptFeedback: scriptFeedback.trim() || undefined,
      sceneFeedback: sceneFeedbackArray,
    });
  }, [
    runId,
    videoId,
    feedbackByVideo,
    scriptFeedback,
    updateFeedbackMutation,
  ]);

  const handleFinalizeAll = useCallback(() => {
    if (!runId) return;
    finalizeAllMutation.mutate({ runId });
  }, [runId, finalizeAllMutation]);

  const handleTriggerExport = useCallback(() => {
    if (!runId) return;
    triggerExportMutation.mutate({ runId });
  }, [runId, triggerExportMutation]);

  const handleRegenerateImagery = useCallback(
    (videoId: string) =>
      (sceneIndex: number, imagery?: string, feedback?: string) => {
        if (!runId) return;
        setSceneUpdating(sceneIndex);
        updateImageryMutation.mutate({
          runId,
          videoId,
          sceneIndex,
          ...(imagery !== undefined && { imagery }),
          ...(feedback !== undefined && { feedback }),
        });
      },
    [runId, updateImageryMutation, setSceneUpdating]
  );

  const onRegenerateImagery =
    selectedVideo &&
      (runPhase === "asset_gen" || runPhase === "export") &&
      (selectedVideo.status === "assets" ||
        selectedVideo.status === "exporting" ||
        selectedVideo.status === "exported")
      ? handleRegenerateImagery(selectedVideo.id)
      : undefined;

  const showPreview =
    selectedVideo?.status === "assets" ||
    selectedVideo?.status === "exporting" ||
    selectedVideo?.status === "exported";

  const displayError = useMemo(() => {
    const err =
      finalizeAllMutation.error ??
      updateImageryMutation.error ??
      triggerExportMutation.error;
    if (!err || err.data?.code === "PRECONDITION_FAILED") return null;
    return err.message;
  }, [
    finalizeAllMutation.error,
    updateImageryMutation.error,
    triggerExportMutation.error,
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground lg:flex-row">
      <VideoSidebar
        runId={runId}
        runPhase={runPhase}
        videos={videos}
        activeVideoId={videoId}
        wsStatus={wsStatus}
        wsCloseInfo={wsCloseInfo}
        revisionLoadingVideoId={
          updateFeedbackMutation.isPending ? videoId : null
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {displayError && (
          <div className="shrink-0 border-b border-destructive/50 bg-destructive/10 px-6 py-3 text-sm text-destructive">
            {displayError}
          </div>
        )}
        <header className="shrink-0 bg-background px-6 py-4">
          <EditRunHeader
            runPhase={runPhase}
            breakdownComplete={effectiveBreakdownComplete}
            exportComplete={allVideosExported}
            canShowNextButton={canShowNextButton}
            canShowExportButton={canShowExportButton}
            isAdmin={!!isAdminQuery.data?.isAdmin}
            onNext={handleFinalizeAll}
            onExport={handleTriggerExport}
            nextPending={finalizeAllMutation.isPending}
            exportPending={triggerExportMutation.isPending}
          />
        </header>

        <div className="scrollbar-seamless min-h-0 flex-1 overflow-auto">
          {selectedVideo && (
            <div className="flex gap-8 px-6 py-6 pb-8">
              <div className="min-w-0 flex-1">
                <div className="mx-auto max-w-2xl">
                  <div
                    className={
                      description ? "mb-1 flex items-center gap-2" : "mb-4 flex items-center gap-2"
                    }
                  >
                    <h1 className="text-xl font-bold">
                      {getVideoDisplayName(selectedVideo)}
                    </h1>
                    <Badge variant="secondary" className="text-xs">
                      {scenes.length} scenes
                    </Badge>
                  </div>
                  {description && (
                    <p className="mb-4 text-sm text-muted-foreground">{description}</p>
                  )}
                  {sourceText && <RawScriptCard sourceText={sourceText} />}
                  <div className="mb-8">
                    <SceneList
                      runId={runId}
                      videoId={videoId}
                      scenes={scenes}
                      currentChunks={currentChunks}
                      runPhase={runPhase}
                      videoStatus={selectedVideo?.status ?? null}
                      blockAcceptSuggestionField={isDecisionPending}
                      onRegenerate={onRegenerateImagery}
                    />
                  </div>
                </div>
              </div>
              {showPreview && (
                <div className="sticky top-6 flex max-h-[calc(100dvh-6rem)] shrink-0 flex-col items-center justify-center self-start">
                  <div className="flex aspect-9/16 w-[360px] min-h-0 max-h-[min(640px,calc(100dvh-10rem))] flex-col overflow-hidden rounded-lg border border-border bg-black">
                    <VideoPreview
                      runId={runId}
                      videoId={videoId}
                      videoStatus={selectedVideo?.status ?? null}
                      runPhase={runPhase}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {!selectedVideo && videos.length === 0 && (
            <div className="px-6 py-6">
              <MainContentSkeleton />
            </div>
          )}
        </div>

        {runPhase === "scripting" && selectedVideo && (
          <footer className="shrink-0 bg-background px-6 py-4">
            {hasActionableSuggestions ? (
              <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Revision ready — accept or decline
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={acceptAllSceneSuggestions}
                    disabled={isDecisionPending}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isDecisionPending ? "Accepting…" : "Accept all suggestions"}
                  </button>
                  <button
                    type="button"
                    onClick={declineSuggestion}
                    disabled={isDecisionPending}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : (
              <ScriptFeedbackSection
                onApplyFeedback={handleApplyFeedback}
                disabled={updateFeedbackMutation.isPending}
                error={
                  updateFeedbackMutation.isError
                    ? updateFeedbackMutation.error?.message ?? null
                    : null
                }
              />
            )}
          </footer>
        )}
      </div>

      <RunLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        runId={runId}
        videoId={videoId}
      />
    </div>
  );
}
