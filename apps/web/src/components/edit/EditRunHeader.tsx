"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useRunStore } from "~/stores/useRunStore";
import { RunProgressSteps, type RunPhase } from "./RunProgressSteps";

interface EditRunHeaderProps {
  runPhase: RunPhase;
  breakdownComplete: boolean;
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
  canShowNextButton,
  canShowExportButton,
  isAdmin,
  onNext,
  onExport,
  nextPending,
  exportPending,
}: EditRunHeaderProps) {
  const setLogsModalOpen = useRunStore((s) => s.setLogsModalOpen);
  return (
    <div className="relative mb-6 flex items-center justify-between">
      <Link href="/" className="text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <div className="absolute left-1/2 -translate-x-1/2">
        <RunProgressSteps
          phase={runPhase}
          breakdownComplete={breakdownComplete}
          compact
        />
      </div>
      <div className="flex items-center gap-4">
        {canShowNextButton && (
          <Button onClick={onNext} disabled={nextPending}>
            Next
          </Button>
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
