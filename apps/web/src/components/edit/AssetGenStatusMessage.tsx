"use client";

import type { RunPhase } from "./RunProgressSteps";

interface AssetGenStatusMessageProps {
  runPhase: RunPhase;
  /** When in export phase, show "All ready" if all videos exported */
  allVideosExported?: boolean;
}

export function AssetGenStatusMessage({
  runPhase,
  allVideosExported = false,
}: AssetGenStatusMessageProps) {
  const message =
    runPhase === "export"
      ? allVideosExported
        ? "All videos are ready. Download or share from the video player."
        : "Rendering videos…"
      : "Generating assets…";

  return (
    <div className="mt-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
