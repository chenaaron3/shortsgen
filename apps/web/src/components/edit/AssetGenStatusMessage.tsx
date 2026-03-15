"use client";

import type { RunPhase } from "./RunProgressSteps";

interface AssetGenStatusMessageProps {
  runPhase: RunPhase;
}

export function AssetGenStatusMessage({ runPhase }: AssetGenStatusMessageProps) {
  const message =
    runPhase === "exporting"
      ? "All videos are ready. Download or share from the video player."
      : "Generating assets…";

  return (
    <div className="mt-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
