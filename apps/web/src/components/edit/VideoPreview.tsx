"use client";

import { Download, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { api } from '~/utils/api';

function DownloadButton({ href }: { href: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "short.mp4";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {loading ? "Downloading…" : "Download"}
      </button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
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
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-black">
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
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            minHeight: 0,
            minWidth: 0,
            objectFit: "contain",
          }}
          controls
          loop
        />
      </div>
      {exportUrl && (
        <DownloadButton href={exportUrl} />
      )}
    </div>
  );
}
