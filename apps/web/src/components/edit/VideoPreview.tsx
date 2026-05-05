"use client";

import { Download, Video } from 'lucide-react';
import dynamic from 'next/dynamic';
import React, { Component } from 'react';
import { buttonVariants } from '~/components/ui/button';
import { RainbowButton } from '~/components/ui/rainbow-button';
import { cn } from '~/lib/utils';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import type { ReactNode } from "react";

import type { RunPhase } from "./RunProgressSteps";

class PlayerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[VideoPreview] Remotion Player error:", error);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** Magic UI rainbow accent ([Rainbow Button](https://magicui.design/docs/components/rainbow-button)) until first download (`export_downloaded_at`). */
function ExportMp4Download({
  downloadHref,
  useRainbowStripe,
  onDownloadRecorded,
}: {
  downloadHref: string;
  useRainbowStripe: boolean;
  onDownloadRecorded: () => void;
}) {
  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const res = await fetch(downloadHref);
      if (!res.ok) return;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "short.mp4";
      a.click();
      URL.revokeObjectURL(objectUrl);
      onDownloadRecorded();
    } catch {
      window.location.href = downloadHref;
    }
  };

  const downloadButtonClassName = cn(
    buttonVariants({ variant: "outline", size: "default" }),
    "w-full justify-center gap-2",
  );

  const contents = (
    <>
      <Download className="h-4 w-4 shrink-0" />
      Download
    </>
  );

  if (useRainbowStripe) {
    return (
      <RainbowButton
        variant="outline"
        size="sm"
        className="w-full rounded-lg border-primary/30"
        asChild
      >
        <a href={downloadHref} download="short.mp4" onClick={handleClick}>
          {contents}
        </a>
      </RainbowButton>
    );
  }

  return (
    <a
      href={downloadHref}
      download="short.mp4"
      onClick={handleClick}
      className={downloadButtonClassName}
    >
      {contents}
    </a>
  );
}

function ExportButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
    >
      <Video className="h-4 w-4" />
      Re-Export
    </button>
  );
}

const Player = dynamic(
  () => import("@remotion/player").then((mod) => mod.Player),
  { ssr: false },
);

const ShortVideo = dynamic(
  () => import("@shortgen/remotion/ShortVideo").then((mod) => mod.ShortVideo),
  { ssr: false },
);

interface VideoPreviewProps {
  runId: string;
  videoId: string;
  videoStatus: string | null;
  runPhase: RunPhase;
}

export function VideoPreview({
  runId,
  videoId,
  videoStatus,
  runPhase,
}: VideoPreviewProps) {
  const utils = api.useUtils();
  const setVideoProgress = useRunStore((s) => s.setVideoProgress);
  const assetsRefreshKey = useRunStore((s) => s.ui.activeAssetsRefreshKey);
  const triggerExportVideoMutation = api.runs.triggerExportVideo.useMutation({
    onSuccess: () => {
      setVideoProgress(videoId, {
        workflow: "export",
        statusMessage: "Rendering…",
      });
      void utils.runs.getById.invalidate({ runId });
      void utils.runs.getVideoAssets.invalidate({ runId, videoId });
    },
  });
  const {
    data: videoAssets,
    isFetched,
    isError,
  } = api.runs.getVideoAssets.useQuery(
    { runId, videoId },
    { enabled: !!runId && !!videoId },
  );

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">Failed to load preview</p>
      </div>
    );
  }

  if (!videoAssets?.manifest?.scenes?.length) {
    if (isFetched && !videoAssets) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
          <p className="text-center text-sm text-muted-foreground">
            Preview unavailable.
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">Loading preview…</p>
      </div>
    );
  }

  const {
    manifest,
    assetBaseUrl,
    exportUrl,
    exportDownloadedAt,
    backgroundMusicUrl,
  } = videoAssets;

  const downloadHref = `/api/download-video?path=${encodeURIComponent(
    `runs/${runId}/${videoId}/short.mp4`,
  )}`;
  const showRainbowDownload =
    Boolean(exportUrl) && exportDownloadedAt == null;

  const playerFallback = (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 p-4">
      <p className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
        Preview failed to load
      </p>
      <p className="text-center text-xs text-muted-foreground">
        This can happen in production if the CDN blocks cross-origin requests.
        Check the browser console for details.
      </p>
    </div>
  );

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
        <PlayerErrorBoundary fallback={playerFallback}>
          <Player
            key={assetsRefreshKey}
            {...({
              acknowledgeRemotionLicense: true,
              component: ShortVideo as React.ComponentType<Record<string, unknown>>,
              inputProps: {
                manifest,
                assetBaseUrl,
                backgroundMusicUrl,
                assetsRefreshKey,
              },
              durationInFrames: manifest.durationInFrames,
              compositionWidth: manifest.width,
              compositionHeight: manifest.height,
              fps: manifest.fps,
              style: {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                minHeight: 0,
                minWidth: 0,
                objectFit: "contain",
              },
              controls: true,
              loop: true,
            } as React.ComponentProps<typeof Player>)}
          />
        </PlayerErrorBoundary>
      </div>
      {exportUrl && (
        <ExportMp4Download
          downloadHref={downloadHref}
          useRainbowStripe={showRainbowDownload}
          onDownloadRecorded={() => {
            void utils.runs.getVideoAssets.invalidate({ runId, videoId });
          }}
        />
      )}
      {!exportUrl &&
        videoStatus === "assets" &&
        runPhase === "export" && (
          <ExportButton
            onClick={() =>
              triggerExportVideoMutation.mutate({ runId, videoId })
            }
            disabled={triggerExportVideoMutation.isPending}
          />
        )}
    </div>
  );
}
