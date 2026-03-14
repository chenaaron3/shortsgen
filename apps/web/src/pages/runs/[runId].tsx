"use client";

import { useRouter } from "next/router";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { api } from "~/utils/api";
import { useRunProgress } from "~/hooks/useRunProgress";
import { env } from "~/env";
import { VideoSidebar } from "~/components/edit/VideoSidebar";
import { SceneList } from "~/components/edit/SceneList";
import { ScriptFeedbackInput } from "~/components/edit/ScriptFeedbackInput";
import { RenderVideoButton } from "~/components/edit/RenderVideoButton";
import { Button } from "~/components/ui/button";
import type { ProgressMessage } from "~/hooks/useRunProgress";
import type { RouterOutputs } from "~/utils/api";

type RunWithVideos = NonNullable<RouterOutputs["runs"]["getById"]> & {
  videos: Array<{ id: string; status: string | null; run_id: string; chunks?: unknown }>;
};

interface ChunksData {
  scenes?: Array<{ text: string; imagery: string; section: string }>;
}

export default function EditRunPage() {
  const router = useRouter();
  const runId = router.query.runId as string | undefined;
  const videoFromQuery = router.query.video as string | undefined;
  const { data: session, status } = useSession();

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
  const [finalizingVideoId, setFinalizingVideoId] = useState<string | null>(null);

  const wsBaseUrl = env.NEXT_PUBLIC_SHORTGEN_WS_URL;
  const wsUrl =
    wsBaseUrl && runId
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

  const runQuery = api.runs.getById.useQuery(
    { runId: runId! },
    { enabled: !!runId }
  );

  const updateFeedbackMutation = api.runs.updateClipFeedback.useMutation();
  const finalizeMutation = api.runs.finalizeClip.useMutation({
    onSuccess: (_, variables) => {
      setFinalizingVideoId(variables.videoId);
    },
  });

  const handleMessage = useCallback(
    (msg: ProgressMessage) => {
      if (msg.type === "VIDEO_READY" && "s3Prefix" in msg && msg.s3Prefix) {
        setReadyVideo({
          videoId: msg.videoId,
          runId: msg.runId,
          s3Prefix: msg.s3Prefix,
        });
        setFinalizingVideoId(null);
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
          setFinalizingVideoId(null);
        }
      }
      if (msg.type === "initial_processing_complete" || msg.type === "clip_complete" || msg.type === "feedback_applied") {
        void runQuery.refetch();
      }
    },
    [runQuery]
  );

  const { status: wsStatus, closeInfo: wsCloseInfo } = useRunProgress({
    wsUrl,
    enabled: !!runId && !!wsUrl,
    onMessage: handleMessage,
  });

  // Auto-select video when videos load (prefer query param on initial load)
  const runData = runQuery.data as RunWithVideos | null | undefined;
  useEffect(() => {
    const videos = runData?.videos ?? [];
    if (videos.length === 0) return;
    const validFromQuery =
      videoFromQuery && videos.some((v) => v.id === videoFromQuery)
        ? videoFromQuery
        : null;
    const fallback = videos[0]!.id;
    if (!selectedVideoId || !videos.some((v) => v.id === selectedVideoId)) {
      setSelectedVideoId(validFromQuery ?? fallback);
    }
  }, [runData?.videos, selectedVideoId, videoFromQuery]);

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

  const handleFinalize = () => {
    if (!runId || !selectedVideoId) return;
    finalizeMutation.mutate({ runId, videoId: selectedVideoId });
  };

  const videos = runData?.videos ?? [];
  const selectedVideo = videos.find((v) => v.id === selectedVideoId);
  const chunks: ChunksData | null = selectedVideo?.chunks
    ? typeof selectedVideo.chunks === "string"
      ? (JSON.parse(selectedVideo.chunks) as ChunksData)
      : (selectedVideo.chunks as ChunksData)
    : null;
  const scenes = chunks?.scenes ?? [];
  const feedbackByScene = feedbackByVideo[selectedVideoId ?? ""]?.sceneFeedback ?? {};

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Invalid run
      </div>
    );
  }

  if (runQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-destructive">{runQuery.error?.message}</p>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
    );
  }

  if (runQuery.data === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p>Run not found</p>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
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
      />
      <main className="flex flex-1 flex-col overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
        </div>

        {selectedVideo && (
          <>
            <h2 className="mb-4 text-lg font-semibold">
              Video {selectedVideo.id.slice(0, 8)} — {scenes.length} scenes
            </h2>
            <div className="mb-8">
              <SceneList
                scenes={scenes}
                feedbackByScene={feedbackByScene}
                onFeedbackChange={handleFeedbackChange(selectedVideo.id)}
              />
            </div>

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

            <div className="mt-6">
              <RenderVideoButton
                onClick={handleFinalize}
                disabled={selectedVideo.status === "ready"}
                isFinalizing={finalizingVideoId === selectedVideo.id}
              />
              {finalizeMutation.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {finalizeMutation.error?.message}
                </p>
              )}
            </div>
          </>
        )}

        {!selectedVideo && videos.length === 0 && (
          <p className="text-muted-foreground">
            Waiting for videos. Processing your content…
          </p>
        )}
      </main>
    </div>
  );
}
