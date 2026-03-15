"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { Suspense, useEffect } from "react";
import { api } from "~/utils/api";
import { AuthRequiredLayout } from "~/components/layouts/AuthRequiredLayout";
import { EditPhaseView } from "~/components/edit/EditPhaseView";
import { RunNotFound } from "~/components/edit/RunNotFound";
import { RunPageSkeleton } from "~/components/edit/RunPageSkeleton";
import { useRunProgressWithHandler } from "~/hooks/useRunProgress";
import { useRunStore } from "~/stores/useRunStore";

function VideoEditContent({
  runId,
  videoId,
}: {
  runId: string;
  videoId: string;
}) {
  const router = useRouter();
  const [runData, runQuery] = api.runs.getById.useSuspenseQuery({ runId });
  const runWithVideos = runData;

  const { init: initStore, reset: resetStore } = useRunStore();

  const videos = runWithVideos?.videos ?? [];
  const video = videos.find((v) => v.id === videoId);

  useEffect(() => {
    if (videos.length > 0 && !video) {
      void router.replace(`/runs/${runId}/videos/${videos[0]!.id}`);
    }
  }, [runId, videos, video, router]);

  useEffect(() => {
    if (videos.length === 0) {
      void router.replace(`/runs/${runId}`);
    }
  }, [runId, videos, router]);

  const { status: wsStatus, closeInfo: wsCloseInfo } = useRunProgressWithHandler(
    runId,
    { refetch: () => void runQuery.refetch() }
  );

  useEffect(() => {
    initStore(runId);
    return () => resetStore();
  }, [runId, initStore, resetStore]);

  if (!runWithVideos) {
    return <RunNotFound />;
  }

  if (videos.length > 0 && !video) {
    return <RunPageSkeleton />;
  }

  if (videos.length === 0) {
    return <RunPageSkeleton />;
  }

  return (
    <EditPhaseView
      runData={runWithVideos}
      videoId={videoId}
      wsStatus={wsStatus}
      wsCloseInfo={wsCloseInfo}
    />
  );
}

export default function VideoEditPage() {
  const router = useRouter();
  const runId = router.query.runId as string | undefined;
  const videoId = router.query.videoId as string | undefined;

  return (
    <AuthRequiredLayout>
      {!runId || !videoId ? (
        router.isReady ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
            <p>Invalid run or video</p>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              ← Back
            </Link>
          </div>
        ) : (
          <RunPageSkeleton />
        )
      ) : (
        <Suspense fallback={<RunPageSkeleton />}>
          <VideoEditContent runId={runId} videoId={videoId} />
        </Suspense>
      )}
    </AuthRequiredLayout>
  );
}
