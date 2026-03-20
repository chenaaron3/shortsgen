"use client";

import dynamic from 'next/dynamic';
import React from 'react';
import { api } from '~/utils/api';

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

  const { manifest, assetBaseUrl } = videoAssets;

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-black">
      <Player
        component={ShortVideo as React.ComponentType<Record<string, unknown>>}
        inputProps={{
          manifest,
          assetBaseUrl,
          backgroundMusicUrl: "/background_music.mp3",
        }}
        durationInFrames={manifest.durationInFrames}
        compositionWidth={manifest.width}
        compositionHeight={manifest.height}
        fps={manifest.fps}
        style={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
        controls
        loop
      />
    </div>
  );
}
