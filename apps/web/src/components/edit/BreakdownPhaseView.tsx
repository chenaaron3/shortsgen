"use client";

import Link from 'next/link';
import { Button } from '~/components/ui/button';
import { useRunStore } from '~/stores/useRunStore';

import { BreakdownHero } from './BreakdownHero';
import { RunLogsModal } from './RunLogsModal';
import { RunProgressSteps } from './RunProgressSteps';

interface BreakdownPhaseViewProps {
  isAdmin: boolean;
  breakdownMessages?: string[] | null;
}

export function BreakdownPhaseView({ isAdmin, breakdownMessages }: BreakdownPhaseViewProps) {
  const runId = useRunStore((s) => s.ui.runId);
  const breakdownComplete = useRunStore((s) => s.ui.breakdownComplete);
  const logsModalOpen = useRunStore((s) => s.ui.logsModalOpen);
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);

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
          {isAdmin && (
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
        <BreakdownHero complete={breakdownComplete} messages={breakdownMessages} />
        <RunProgressSteps
          phase="breakdown"
          breakdownComplete={breakdownComplete}
          className="mt-12"
        />
      </main>
      <RunLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        runId={runId ?? ""}
        videoId={null}
      />
    </div>
  );
}
