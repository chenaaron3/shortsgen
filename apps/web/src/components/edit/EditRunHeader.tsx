"use client";

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from '~/components/ui/dialog';
import { useUserConfig } from '~/hooks/useUserConfig';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { CREDITS_ASSETS_PER_VIDEO } from '@shortgen/db';

import { RunProgressSteps } from './RunProgressSteps';

import type { RunPhase } from "./RunProgressSteps";

interface EditRunHeaderProps {
  runPhase: RunPhase;
  breakdownComplete: boolean;
  /** When true, the export step shows as completed. */
  exportComplete?: boolean;
  canShowNextButton: boolean;
  canShowExportButton: boolean;
  isAdmin: boolean;
  onNext: () => void;
  onExport: () => void;
  nextPending: boolean;
  exportPending: boolean;
}

export function EditRunHeader({
  runPhase,
  breakdownComplete,
  exportComplete = false,
  canShowNextButton,
  canShowExportButton,
  isAdmin,
  onNext,
  onExport,
  nextPending,
  exportPending,
}: EditRunHeaderProps) {
  const runId = useRunStore((s) => s.ui.runId);
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);
  const { creditsBalance, isLoading: creditsLoading } = useUserConfig();
  const { data: runData } = api.runs.getById.useQuery(
    { runId: runId ?? "" },
    { enabled: !!runId },
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const videos = runData?.videos ?? [];
  const generateEligibleVideos = videos.filter((v) => v.status === "scripts").length;
  const generateCreditsCost = generateEligibleVideos * CREDITS_ASSETS_PER_VIDEO;
  const afterRunBalance = Math.max(creditsBalance - generateCreditsCost, 0);

  const handleConfirmGenerate = () => {
    setConfirmOpen(false);
    onNext();
  };

  const hasEnoughCredits = creditsBalance >= generateCreditsCost;
  return (
    <div className="relative mb-6 flex items-center justify-between">
      <Link href="/" className="text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <div className="absolute left-1/2 -translate-x-1/2">
        <RunProgressSteps
          phase={runPhase}
          breakdownComplete={breakdownComplete}
          exportComplete={exportComplete}
          compact
        />
      </div>
      <div className="flex items-center gap-4">
        {canShowNextButton && (
          <>
            <Button onClick={() => setConfirmOpen(true)} disabled={nextPending}>
              <Sparkles className="mr-1 size-4" />
              Generate
            </Button>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    Confirm generation
                  </DialogTitle>
                </DialogHeader>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">Starting balance</span>
                    <span className="font-medium">
                      {creditsLoading ? "…" : `${creditsBalance.toLocaleString()} credits`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">Videos (x{generateEligibleVideos})</span>
                    <span className="font-medium">
                      {generateCreditsCost.toLocaleString()} credits
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                    <span className="font-medium">After run</span>
                    <span className="font-semibold">
                      {creditsLoading ? "…" : `${afterRunBalance.toLocaleString()} credits`}
                    </span>
                  </div>
                </div>
                {!creditsLoading && !hasEnoughCredits && (
                  <p className="text-sm text-destructive">
                    You may not have enough credits to complete this action.
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmOpen(false)}
                    disabled={nextPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmGenerate}
                    disabled={nextPending}
                  >
                    <Sparkles className="mr-1 size-4" />
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        {canShowExportButton && (
          <Button onClick={onExport} disabled={exportPending}>
            Export
          </Button>
        )}
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setLogsModalOpen(true)}>
            View logs
          </Button>
        )}
      </div>
    </div>
  );
}
