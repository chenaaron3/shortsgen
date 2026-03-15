"use client";

import { useCallback } from "react";
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { useSuggestionFeedback } from "~/hooks/useSuggestionFeedback";
import { AssetGenStatusMessage } from './AssetGenStatusMessage';
import { EditRunHeader } from './EditRunHeader';
import { RawScriptCard } from './RawScriptCard';
import { RunLogsModal } from './RunLogsModal';
import { MainContentSkeleton } from './RunPageSkeleton';
import { SceneList } from './SceneList';
import { ScriptFeedbackSection } from './ScriptFeedbackSection';
import { VideoSidebar } from './VideoSidebar';

import type { RunPhase } from "./RunProgressSteps";
import type { RouterOutputs } from "~/utils/api";

type RunWithVideos = NonNullable<RouterOutputs["runs"]["getById"]>;

interface ChunksData {
  scenes?: Array<{ text: string; imagery: string; section: string }>;
}

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

  const { setSceneUpdating, setVideoUpdating } = useRunStore();

  const sourceTextByVideo = useRunStore((s) => s.ui.sourceTextByVideo);
  const feedbackByVideo = useRunStore((s) => s.feedback.feedbackByVideo);
  const scriptFeedback = useRunStore((s) => s.feedback.scriptFeedback);
  const breakdownComplete = useRunStore((s) => s.progress.breakdownComplete);
  const sceneUpdating = useRunStore((s) => s.progress.sceneUpdating);
  const videoUpdating = useRunStore((s) => s.progress.videoUpdating);
  const setSceneFeedback = useRunStore((s) => s.setSceneFeedback);
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);
  const logsModalOpen = useRunStore((s) => s.ui.logsModalOpen);

  const videos = runData.videos ?? [];
  const selectedVideo = videos.find((v) => v.id === videoId);
  const chunks: ChunksData | null = selectedVideo?.chunks
    ? typeof selectedVideo.chunks === "string"
      ? (JSON.parse(selectedVideo.chunks) as ChunksData)
      : (selectedVideo.chunks as ChunksData)
    : null;
  const scenes = chunks?.scenes ?? [];
  const sourceText = selectedVideo
    ? (sourceTextByVideo[selectedVideo.id] ?? selectedVideo.source_text ?? "")
    : "";
  const feedbackByScene = feedbackByVideo[videoId]?.sceneFeedback ?? {};
  const feedbackPartial = useRunStore((s) => s.progress.feedbackPartialByVideo[videoId]);
  const clearFeedbackPartial = useRunStore((s) => s.clearFeedbackPartial);
  const effectiveBreakdownComplete = breakdownComplete || videos.length > 0;

  const onSuggestionAcceptSuccess = useCallback(() => {
    clearFeedbackPartial(videoId);
    void runQuery.refetch();
  }, [videoId, clearFeedbackPartial, runQuery]);

  const {
    suggestionDecisions,
    onSuggestionDecision,
    acceptSuggestion,
    declineSuggestion,
    isDecisionPending,
  } = useSuggestionFeedback({
    runId,
    videoId,
    feedbackPartial,
    scenes,
    onAcceptSuccess: onSuggestionAcceptSuccess,
    onDeclineSuccess: onSuggestionAcceptSuccess,
  });

  const updateFeedbackMutation = api.runs.updateClipFeedback.useMutation();
  const finalizeAllMutation = api.runs.finalizeAll.useMutation({
    onSuccess: () => {
      setVideoUpdating(true);
      void runQuery.refetch();
    },
  });
  const finalizeAssetsMutation = api.runs.finalizeAssets.useMutation({
    onSuccess: () => void runQuery.refetch(),
  });
  const updateImageryMutation = api.runs.updateImagery.useMutation({
    onSuccess: (_, variables) => setSceneUpdating(variables.sceneIndex),
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
  const canShowExportButton =
    runPhase === "asset_gen" &&
    allVideosHaveAssets &&
    !finalizeAssetsMutation.isPending;

  const handleApplyFeedback = useCallback(() => {
    if (!runId || !videoId) return;
    const fb = feedbackByVideo[videoId];
    const sceneFeedbackArray = fb?.sceneFeedback
      ? Object.entries(fb.sceneFeedback)
        .filter(([, v]) => v.trim().length > 0)
        .map(([k, v]) => ({ sceneIndex: Number(k), feedback: v }))
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

  const handleFinalizeAssets = useCallback(() => {
    if (!runId) return;
    finalizeAssetsMutation.mutate({ runId });
  }, [runId, finalizeAssetsMutation]);

  const handleRegenerateImagery = useCallback(
    (videoId: string) =>
      (sceneIndex: number, imagery?: string, feedback?: string) => {
        if (!runId) return;
        updateImageryMutation.mutate({
          runId,
          videoId,
          sceneIndex,
          ...(imagery !== undefined && { imagery }),
          ...(feedback !== undefined && { feedback }),
        });
      },
    [runId, updateImageryMutation]
  );

  const handleFeedbackChange =
    videoId
      ? (sceneIndex: number, _liked: boolean | null, feedback: string) =>
        setSceneFeedback(videoId, sceneIndex, feedback)
      : undefined;

  const scriptLocked = runPhase === "asset_gen" || runPhase === "export";
  const imageryEditable = runPhase === "asset_gen" || runPhase === "export";
  const onRegenerateImagery =
    selectedVideo &&
      (runPhase === "asset_gen" || runPhase === "export") &&
      selectedVideo.status === "export"
      ? handleRegenerateImagery(selectedVideo.id)
      : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      <VideoSidebar
        runId={runId}
        videos={videos}
        activeVideoId={videoId}
        wsStatus={wsStatus}
        wsCloseInfo={wsCloseInfo}
        revisionLoadingVideoId={
          updateFeedbackMutation.isPending ? videoId : null
        }
      />
      <main className="flex flex-1 flex-col overflow-auto p-6">
        <EditRunHeader
          runPhase={runPhase}
          breakdownComplete={effectiveBreakdownComplete}
          canShowNextButton={canShowNextButton}
          canShowExportButton={canShowExportButton}
          isAdmin={!!isAdminQuery.data?.isAdmin}
          onNext={handleFinalizeAll}
          onExport={handleFinalizeAssets}
          nextPending={finalizeAllMutation.isPending}
          exportPending={finalizeAssetsMutation.isPending}
        />

        {selectedVideo && (
          <>
            {sourceText && <RawScriptCard sourceText={sourceText} />}
            <h2 className="mb-4 text-lg font-semibold">
              Video {selectedVideo.id.slice(0, 8)} — {scenes.length} scenes
            </h2>
            {feedbackPartial && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Revision ready — accept or decline
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={acceptSuggestion}
                    disabled={isDecisionPending}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isDecisionPending ? "Accepting…" : "Accept"}
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
            )}
            <div className="mb-8">
              <SceneList
                scenes={scenes}
                feedbackByScene={feedbackByScene}
                suggestionScenes={feedbackPartial?.scenes}
                suggestionDecisions={suggestionDecisions}
                onSuggestionDecision={onSuggestionDecision}
                onFeedbackChange={handleFeedbackChange!}
                scriptLocked={scriptLocked}
                imageryEditable={imageryEditable}
                onRegenerate={onRegenerateImagery}
                sceneUpdating={sceneUpdating}
              />
            </div>

            {runPhase === "scripting" && (
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

            {(runPhase === "asset_gen" || runPhase === "export") && (
              <AssetGenStatusMessage runPhase={runPhase} />
            )}
          </>
        )}

        {!selectedVideo && videos.length === 0 && <MainContentSkeleton />}
      </main>

      <RunLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        runId={runId}
        videoId={videoId}
      />
    </div>
  );
}
