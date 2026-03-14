"use client";

import { useRouter } from "next/router";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { api } from "~/utils/api";
import { useRunProgress } from "~/hooks/useRunProgress";
import { env } from "~/env";
import { VideoSidebar } from "~/components/edit/VideoSidebar";
import { SceneList } from "~/components/edit/SceneList";
import { RunLogsModal } from "~/components/edit/RunLogsModal";
import { ScriptFeedbackInput } from "~/components/edit/ScriptFeedbackInput";
import { Button } from "~/components/ui/button";
import { MainContentSkeleton, RunPageSkeleton } from "~/components/edit/RunPageSkeleton";
import {
  RunProgressSteps,
  type RunPhase,
} from "~/components/edit/RunProgressSteps";
import { BreakdownHero } from "~/components/edit/BreakdownHero";
import type { ProgressMessage } from "~/hooks/useRunProgress";
import type { RouterOutputs } from "~/utils/api";

type RunWithVideos = NonNullable<RouterOutputs["runs"]["getById"]> & {
  videos: Array<{
    id: string;
    status: string | null;
    run_id: string;
    chunks?: unknown;
    source_text?: string | null;
  }>;
};

interface ChunksData {
  scenes?: Array<{ text: string; imagery: string; section: string }>;
}

function EditRunContent({ runId, videoFromQuery }: { runId: string; videoFromQuery?: string }) {
  const [runData, runQuery] = api.runs.getById.useSuspenseQuery({ runId });
  const runWithVideos = runData as RunWithVideos | null;

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [scriptFeedback, setScriptFeedback] = useState("");
  const [feedbackByVideo, setFeedbackByVideo] = useState<
    Record<string, { scriptFeedback?: string; sceneFeedback?: Record<number, string> }>
  >({});
  const [readyVideo, setReadyVideo] = useState<{
    videoId: string;
    runId: string;
    s3Prefix: string;
  } | null>(null);
  const [finalizeAllInProgress, setFinalizeAllInProgress] = useState(false);
  const [regeneratingSceneIndex, setRegeneratingSceneIndex] = useState<number | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [breakdownStarted, setBreakdownStarted] = useState(false);
  const [breakdownComplete, setBreakdownComplete] = useState(false);
  const [sourceTextByVideo, setSourceTextByVideo] = useState<Record<string, string>>({});

  const wsBaseUrl = env.NEXT_PUBLIC_SHORTGEN_WS_URL;
  const wsUrl =
    wsBaseUrl
      ? (() => {
          try {
            const u = new URL(wsBaseUrl);
            if (!u.pathname || u.pathname === "/") u.pathname = "/$default";
            return `${u.toString()}?runId=${runId}`;
          } catch {
            return `${wsBaseUrl}?runId=${runId}`;
          }
        })()
      : "";

  const handleMessage = useCallback(
    (msg: ProgressMessage) => {
      if (msg.type === "breakdown_started") setBreakdownStarted(true);
      if (msg.type === "breakdown_complete") setBreakdownComplete(true);

      if (msg.type === "clip_started" && msg.payload) {
        const p = msg.payload as { videoId?: string; sourceText?: string };
        const vid = p.videoId ?? msg.videoId;
        const text = p.sourceText ?? "";
        if (vid) {
          setSourceTextByVideo((prev) => ({ ...prev, [vid]: text }));
          void runQuery.refetch();
        }
      }

      if (msg.type === "VIDEO_READY" && "s3Prefix" in msg && msg.s3Prefix) {
        setReadyVideo({
          videoId: msg.videoId,
          runId: msg.runId,
          s3Prefix: msg.s3Prefix,
        });
        setFinalizeAllInProgress(false);
      }
      if (msg.type === "finalize_complete" && msg.payload) {
        const p = msg.payload as { videoId?: string; s3Prefix?: string };
        const vid = p.videoId ?? msg.videoId;
        const prefix = p.s3Prefix ?? "";
        if (vid && prefix) {
          setReadyVideo({
            videoId: vid,
            runId: msg.runId,
            s3Prefix: prefix,
          });
          setFinalizeAllInProgress(false);
        }
      }
      if (
        msg.type === "initial_processing_complete" ||
        msg.type === "clip_complete" ||
        msg.type === "feedback_applied"
      ) {
        setRegeneratingSceneIndex(null);
        void runQuery.refetch();
      }
    },
    [runQuery]
  );

  const { status: wsStatus, closeInfo: wsCloseInfo } = useRunProgress({
    wsUrl,
    enabled: !!wsUrl,
    onMessage: handleMessage,
  });

  const videos = runWithVideos?.videos ?? [];
  const runStatus = runWithVideos?.status;

  useEffect(() => {
    if (videos.length === 0 && runStatus === "processing") {
      setBreakdownStarted(true);
    }
  }, [videos.length, runStatus]);

  useEffect(() => {
    if (videos.length === 0) return;
    const validFromQuery =
      videoFromQuery && videos.some((v) => v.id === videoFromQuery)
        ? videoFromQuery
        : null;
    const fallback = videos[0]!.id;
    if (!selectedVideoId || !videos.some((v) => v.id === selectedVideoId)) {
      setSelectedVideoId(validFromQuery ?? fallback);
    }
  }, [videos, selectedVideoId, videoFromQuery]);

  const handleFeedbackChange = useCallback(
    (videoId: string) => (sceneIndex: number, _liked: boolean | null, feedback: string) => {
      setFeedbackByVideo((prev) => ({
        ...prev,
        [videoId]: {
          ...prev[videoId],
          sceneFeedback: {
            ...prev[videoId]?.sceneFeedback,
            [sceneIndex]: feedback,
          },
        },
      }));
    },
    []
  );

  const updateFeedbackMutation = api.runs.updateClipFeedback.useMutation();
  const finalizeAllMutation = api.runs.finalizeAll.useMutation({
    onSuccess: () => {
      setFinalizeAllInProgress(true);
    },
  });
  const finalizeAssetsMutation = api.runs.finalizeAssets.useMutation({
    onSuccess: () => {
      void runQuery.refetch();
    },
  });
  const updateImageryMutation = api.runs.updateImagery.useMutation({
    onSuccess: (_, variables) => {
      setRegeneratingSceneIndex(variables.sceneIndex);
    },
  });
  const isAdminQuery = api.admin.isAdmin.useQuery();

  const handleApplyFeedback = () => {
    if (!runId || !selectedVideoId) return;
    const fb = feedbackByVideo[selectedVideoId];
    const sceneFeedbackArray = fb?.sceneFeedback
      ? Object.entries(fb.sceneFeedback)
        .filter(([, v]) => v.trim().length > 0)
        .map(([k, v]) => ({ sceneIndex: Number(k), feedback: v }))
      : undefined;
    updateFeedbackMutation.mutate({
      runId,
      videoId: selectedVideoId,
      scriptFeedback: scriptFeedback.trim() || undefined,
      sceneFeedback: sceneFeedbackArray,
    });
  };

  const handleFinalizeAll = () => {
    if (!runId) return;
    finalizeAllMutation.mutate({ runId });
  };

  const handleFinalizeAssets = () => {
    if (!runId) return;
    finalizeAssetsMutation.mutate({ runId });
  };

  const handleRegenerateImagery = useCallback(
    (videoId: string) => (sceneIndex: number, imagery?: string, feedback?: string) => {
      if (!runId) return;
      updateImageryMutation.mutate({
        runId,
        videoId,
        sceneIndex,
        ...(imagery !== undefined && { imagery }),
        ...(feedback !== undefined && { feedback }),
      });
    },
    [runId, updateImageryMutation],
  );

  // Derive run phase from events + video statuses
  const runPhase: RunPhase = (() => {
    if (videos.length === 0) return "breakdown";
    const allExport = videos.every((v) => v.status === "export");
    if (allExport) return "exporting";
    const anyAssets = videos.some((v) => v.status === "assets");
    if (anyAssets || finalizeAllInProgress) return "asset_gen";
    return "scripting";
  })();

  const showHeroLayout = videos.length === 0;
  const allVideosHaveScripts =
    videos.length > 0 && videos.every((v) => v.status === "scripts");
  const canShowNextButton =
    runPhase === "scripting" &&
    allVideosHaveScripts &&
    !finalizeAllInProgress &&
    !finalizeAllMutation.isPending;
  const allVideosHaveAssets =
    videos.length > 0 && videos.every((v) => v.status === "assets");
  const canShowExportButton =
    runPhase === "asset_gen" &&
    allVideosHaveAssets &&
    !finalizeAssetsMutation.isPending;

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);
  const chunks: ChunksData | null = selectedVideo?.chunks
    ? typeof selectedVideo.chunks === "string"
      ? (JSON.parse(selectedVideo.chunks) as ChunksData)
      : (selectedVideo.chunks as ChunksData)
    : null;
  const scenes = chunks?.scenes ?? [];
  const feedbackByScene = feedbackByVideo[selectedVideoId ?? ""]?.sceneFeedback ?? {};

  if (!runWithVideos) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p>Run not found</p>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
    );
  }

  if (showHeroLayout) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              ← Back
            </Link>
            <RunProgressSteps
              phase="breakdown"
              breakdownComplete={breakdownComplete}
              compact
            />
            {isAdminQuery.data?.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogsModalOpen(true)}
              >
                View logs
              </Button>
            )}
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center p-8">
          <BreakdownHero complete={breakdownComplete} />
          <RunProgressSteps
            phase="breakdown"
            breakdownComplete={breakdownComplete}
            className="mt-12"
          />
        </main>
        <RunLogsModal
          open={logsModalOpen}
          onClose={() => setLogsModalOpen(false)}
          runId={runId}
          videoId={selectedVideoId}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      <VideoSidebar
        videos={videos}
        selectedVideoId={selectedVideoId}
        onSelectVideo={setSelectedVideoId}
        wsStatus={wsStatus}
        wsCloseInfo={wsCloseInfo}
        revisionLoadingVideoId={updateFeedbackMutation.isPending ? selectedVideoId : null}
      />
      <main className="flex flex-1 flex-col overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <div className="flex items-center gap-4">
            <RunProgressSteps
              phase={runPhase}
              breakdownComplete={breakdownComplete}
              compact
            />
            {canShowNextButton && (
              <Button
                onClick={handleFinalizeAll}
                disabled={finalizeAllMutation.isPending}
              >
                Next
              </Button>
            )}
            {canShowExportButton && (
              <Button
                onClick={handleFinalizeAssets}
                disabled={finalizeAssetsMutation.isPending}
              >
                Export
              </Button>
            )}
            {isAdminQuery.data?.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogsModalOpen(true)}
              >
                View logs
              </Button>
            )}
          </div>
        </div>

        {selectedVideo && (
          <>
            {(sourceTextByVideo[selectedVideo.id] ?? selectedVideo.source_text) && (
              <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Raw script
                </h3>
                <p className="whitespace-pre-wrap text-sm">
                  {sourceTextByVideo[selectedVideo.id] ?? selectedVideo.source_text ?? ""}
                </p>
              </div>
            )}
            <h2 className="mb-4 text-lg font-semibold">
              Video {selectedVideo.id.slice(0, 8)} — {scenes.length} scenes
            </h2>
            <div className="mb-8">
              <SceneList
                scenes={scenes}
                feedbackByScene={feedbackByScene}
                onFeedbackChange={handleFeedbackChange(selectedVideo.id)}
                scriptLocked={runPhase === "asset_gen" || runPhase === "exporting"}
                imageryEditable={runPhase === "asset_gen" || runPhase === "exporting"}
                onRegenerate={
                  (runPhase === "asset_gen" || runPhase === "exporting") &&
                  selectedVideo.status === "export"
                    ? handleRegenerateImagery(selectedVideo.id)
                    : undefined
                }
                regeneratingSceneIndex={regeneratingSceneIndex}
              />
            </div>

            {runPhase === "scripting" && (
            <div className="mt-auto border-t border-border pt-6">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Script feedback
              </h3>
              <ScriptFeedbackInput
                value={scriptFeedback}
                onChange={setScriptFeedback}
                onSubmit={handleApplyFeedback}
                disabled={updateFeedbackMutation.isPending}
              />
              {updateFeedbackMutation.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {updateFeedbackMutation.error?.message}
                </p>
              )}
            </div>
            )}

            {(runPhase === "asset_gen" || runPhase === "exporting") && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  {runPhase === "exporting"
                    ? "All videos are ready. Download or share from the video player."
                    : "Generating assets…"}
                </p>
              </div>
            )}
          </>
        )}

        {!selectedVideo && videos.length === 0 && (
          <MainContentSkeleton />
        )}
      </main>

      <RunLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        runId={runId}
        videoId={selectedVideoId}
      />
    </div>
  );
}

export default function EditRunPage() {
  const router = useRouter();
  const runId = router.query.runId as string | undefined;
  const videoFromQuery = router.query.video as string | undefined;
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p>Sign in to edit runs.</p>
        <Button onClick={() => void signIn()} variant="secondary">
          Sign in
        </Button>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
    );
  }

  if (!runId) {
    if (router.isReady) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
          <p>Invalid run</p>
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
        </div>
      );
    }
    return <RunPageSkeleton />;
  }

  return (
    <Suspense fallback={<RunPageSkeleton />}>
      <EditRunContent runId={runId} videoFromQuery={videoFromQuery} />
    </Suspense>
  );
}
