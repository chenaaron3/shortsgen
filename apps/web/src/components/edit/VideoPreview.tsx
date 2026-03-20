"use client";

import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import React from "react";
import { api } from "~/utils/api";

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
      console.log("videoAssets", videoAssets);
      console.log("isFetched", isFetched);
      console.log("isError", isError);
      console.log("runId", runId);
      console.log("videoId", videoId);
      console.log("videoAssets", videoAssets);
      console.log("videoAssets", videoAssets);
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

  return (
    <div className="flex flex-col gap-2">
      <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-black">
        <Player
        acknowledgeRemotionLicense
        component={ShortVideo as React.ComponentType<Record<string, unknown>>}
        inputProps={{
          manifest,
          assetBaseUrl,
          backgroundMusicUrl,
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
      {exportUrl && (
        <a
          href={exportUrl}
          download="short.mp4"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </div>
  );
}
