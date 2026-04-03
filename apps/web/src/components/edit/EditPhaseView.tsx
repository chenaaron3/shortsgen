"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { useExportProgressPolling } from '~/hooks/useExportProgressPolling';
import { getVideoDisplayName, parseVideoChunks } from '~/lib/parseVideoChunks';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { EditRunHeader } from './EditRunHeader';
import { RawScriptCard } from './RawScriptCard';
import { RunLogsModal } from './RunLogsModal';
import { MainContentSkeleton } from './RunPageSkeleton';
import { SceneList } from './SceneList';
import { ScriptingPhaseFooter } from './ScriptingPhaseFooter';
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

  const { setVideoUpdating, setVideoProgress } = useRunStore();
  const setRunId = useRunStore((s) => s.setRunId);
  const setActiveVideo = useRunStore((s) => s.setActiveVideo);
  const setActiveRunPhase = useRunStore((s) => s.setActiveRunPhase);

  const activeSourceText = useRunStore((s) => s.ui.activeSourceText);
  const breakdownComplete = useRunStore((s) => s.ui.breakdownComplete);
  const videoUpdating = useRunStore((s) => s.ui.videoUpdating);
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);
  const logsModalOpen = useRunStore((s) => s.ui.logsModalOpen);

  const videos = runData.videos ?? [];
  const selectedVideo = videos.find((v) => v.id === videoId);

  const { scenes, description } = useMemo(
    () => parseVideoChunks(selectedVideo?.chunks),
    [selectedVideo?.chunks],
  );
  const sourceText = activeSourceText || selectedVideo?.source_text || "";
  const sceneSuggestions = useRunStore((s) => s.ui.activeSceneSuggestions);
  const clearSceneSuggestions = useRunStore((s) => s.clearSceneSuggestions);
  const effectiveBreakdownComplete = breakdownComplete || videos.length > 0;

  useEffect(() => {
    setRunId(runId);
  }, [runId, setRunId]);

  useEffect(() => {
    setActiveVideo({
      id: videoId,
      status: selectedVideo?.status ?? null,
      sourceText: selectedVideo?.source_text ?? "",
    });
  }, [videoId, selectedVideo?.status, selectedVideo?.source_text, setActiveVideo]);

  useEffect(() => {
    if (!sceneSuggestions) return;
    if (sceneSuggestions.scenes.length === 0) {
      clearSceneSuggestions();
    }
  }, [sceneSuggestions, clearSceneSuggestions]);

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

  const [scriptingFooterLoading, setScriptingFooterLoading] = useState({
    decisionPending: false,
    feedbackPending: false,
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

  const refetchRun = useCallback(() => {
    void runQuery.refetch();
  }, [runQuery]);

  useExportProgressPolling(runId, videos, refetchRun);
  const runPhase: RunPhase = (runData.status ?? "breakdown") as RunPhase;

  useEffect(() => {
    setActiveRunPhase(runPhase);
  }, [runPhase, setActiveRunPhase]);

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

  const handleFinalizeAll = useCallback(() => {
    if (!runId) return;
    finalizeAllMutation.mutate({ runId });
  }, [runId, finalizeAllMutation]);

  const handleTriggerExport = useCallback(() => {
    if (!runId) return;
    triggerExportMutation.mutate({ runId });
  }, [runId, triggerExportMutation]);

  const showPreview =
    selectedVideo?.status === "assets" ||
    selectedVideo?.status === "exporting" ||
    selectedVideo?.status === "exported";

  const displayError = useMemo(() => {
    const err =
      finalizeAllMutation.error ??
      triggerExportMutation.error;
    if (!err || err.data?.code === "PRECONDITION_FAILED") return null;
    return err.message;
  }, [
    finalizeAllMutation.error,
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
          scriptingFooterLoading.feedbackPending ? videoId : null
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
                      scenes={scenes}
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
          <ScriptingPhaseFooter
            runId={runId}
            videoId={videoId}
            onLoadingStateChange={setScriptingFooterLoading}
          />
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
