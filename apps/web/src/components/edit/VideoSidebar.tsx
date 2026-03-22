"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getVideoDisplayName } from "~/lib/parseVideoChunks";
import { getProgressValue, getStepLabel } from "~/lib/videoProgress";
import { useRunStore } from "~/stores/useRunStore";
import { Skeleton } from "~/components/ui/skeleton";

interface Video {
  id: string;
  status: string | null;
  chunks?: unknown;
}

interface VideoSidebarProps {
  runId: string;
  videos: Video[];
  activeVideoId: string;
  wsStatus: string;
  wsCloseInfo?: { code: number; reason: string } | null;
  /** Video ID showing revision loading indicator (feedback submitted, waiting for apply). */
  revisionLoadingVideoId?: string | null;
}

export function VideoSidebar({
  runId,
  videos,
  activeVideoId,
  wsStatus,
  wsCloseInfo,
  revisionLoadingVideoId,
}: VideoSidebarProps) {
  const videoProgressByVideo = useRunStore((s) => s.progress.videoProgressByVideo);

  return (
    <aside className="scrollbar-seamless w-56 shrink-0 overflow-y-auto bg-card p-4 lg:w-64">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            wsStatus === "connected"
              ? "bg-green-500"
              : wsStatus === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-muted-foreground/50"
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {wsStatus === "connected"
            ? "Live"
            : wsStatus === "closed" && wsCloseInfo
              ? `closed (${wsCloseInfo.code})`
              : wsStatus}
        </span>
      </div>
      <h3 className="mb-2 text-sm font-medium text-foreground">Videos</h3>
      {videos.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <nav className="space-y-1">
          {videos.map((v) => {
            const progress = videoProgressByVideo[v.id];
            const stepLabel = getStepLabel(progress);
            const progressPct = getProgressValue(progress);
            const inProgress =
              !!progress ||
              revisionLoadingVideoId === v.id;

            if (inProgress) {
              console.log("[VideoSidebar] progress", {
                videoId: v.id,
                progressPct,
                workflow: progress?.workflow,
                type: progress?.type,
                serverProgress: progress?.progress,
              });
            }

            return (
              <Link
                key={v.id}
                href={`/runs/${runId}/videos/${v.id}`}
                className={`relative block overflow-hidden rounded-lg ${
                  activeVideoId === v.id
                    ? "bg-accent/80 text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {inProgress && (
                  <div
                    className="absolute inset-0 z-0 transition-[background] duration-300"
                    aria-hidden
                    style={{
                      background: `linear-gradient(to right, color-mix(in oklch, var(--primary) 30%, transparent) 0%, color-mix(in oklch, var(--primary) 30%, transparent) ${progressPct * 100}%, transparent ${progressPct * 100}%, transparent 100%)`,
                    }}
                  />
                )}
                <div className="relative z-10 flex w-full flex-col gap-0.5 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {getVideoDisplayName(v)}
                    </span>
                    {(!!progress || revisionLoadingVideoId === v.id) && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    )}
                  </div>
                  {stepLabel && (
                    <span className="text-xs opacity-80">{stepLabel}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
