"use client";

import { Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import React, { Component } from 'react';
import { api } from '~/utils/api';

import type { ReactNode } from 'react';
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

function DownloadButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      download="short.mp4"
      className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
    >
      <Download className="h-4 w-4" />
      Download
    </a>
  );
}

const Player = dynamic(
  () => import("@remotion/player").then((mod) => mod.Player),
  { ssr: false }
);

const ShortVideo = dynamic(
  () => import("@shortgen/remotion/ShortVideo").then((mod) => mod.ShortVideo),
  { ssr: false }
);

interface VideoPreviewProps {
  runId: string;
  videoId: string;
}

export function VideoPreview({ runId, videoId }: VideoPreviewProps) {
  const {
    data: videoAssets,
    isFetched,
    isError,
  } = api.runs.getVideoAssets.useQuery(
    { runId, videoId },
    { enabled: !!runId && !!videoId }
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

  const { manifest, assetBaseUrl, exportUrl, backgroundMusicUrl } =
    videoAssets;

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
            {...({
              acknowledgeRemotionLicense: true,
              component: ShortVideo as React.ComponentType<Record<string, unknown>>,
              inputProps: { manifest, assetBaseUrl, backgroundMusicUrl },
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
        <DownloadButton
          href={`/api/download-video?path=${encodeURIComponent(`runs/${runId}/${videoId}/short.mp4`)}`}
        />
      )}
    </div>
  );
}
