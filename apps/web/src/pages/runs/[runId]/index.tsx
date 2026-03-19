"use client";

import Link from 'next/link';
import { useRouter } from 'next/router';
import { Suspense, useEffect } from 'react';
import { BreakdownPhaseView } from '~/components/edit/BreakdownPhaseView';
import { RunNotFound } from '~/components/edit/RunNotFound';
import { RunPageSkeleton } from '~/components/edit/RunPageSkeleton';
import { AuthRequiredLayout } from '~/components/layouts/AuthRequiredLayout';
import { Button } from '~/components/ui/button';
import { useRunProgressWithHandler } from '~/hooks/useRunProgress';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { breakdownMessagesSchema } from '@shortgen/types';

function EditRunContent({ runId }: { runId: string }) {
  const router = useRouter();
  const [runData, runQuery] = api.runs.getById.useSuspenseQuery({ runId });
  const runWithVideos = runData;
  const isAdminQuery = api.admin.isAdmin.useQuery();

  const { init: initStore, reset: resetStore } = useRunStore();

  const videos = runWithVideos?.videos ?? [];

  useRunProgressWithHandler(runId, { refetch: () => void runQuery.refetch() });

  useEffect(() => {
    initStore(runId);
    return () => resetStore();
  }, [runId, initStore, resetStore]);

  // Redirect to first video when videos exist
  useEffect(() => {
    if (videos.length > 0) {
      void router.replace(`/runs/${runId}/videos/${videos[0]!.id}`);
    }
  }, [runId, videos, router]);

  if (!runWithVideos) {
    return <RunNotFound />;
  }

  const showHeroLayout = videos.length === 0;

  if (showHeroLayout) {
    let messages: string[] | undefined;
    const raw = runWithVideos.breakdown_messages;
    if (raw) {
      const result = breakdownMessagesSchema.safeParse(JSON.parse(raw));
      if (result.success) messages = result.data;
    }
    return (
      <BreakdownPhaseView
        isAdmin={!!isAdminQuery.data?.isAdmin}
        breakdownMessages={messages}
      />
    );
  }

  // Brief loading state while redirecting
  return <RunPageSkeleton />;
}

export default function EditRunPage() {
  const router = useRouter();
  const runId = router.query.runId as string | undefined;

  return (
    <AuthRequiredLayout>
      {!runId ? (
        router.isReady ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
            <p>Invalid run</p>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              ← Back
            </Link>
          </div>
        ) : (
          <RunPageSkeleton />
        )
      ) : (
        <Suspense fallback={<RunPageSkeleton />}>
          <EditRunContent runId={runId} />
        </Suspense>
      )}
    </AuthRequiredLayout>
  );
}
