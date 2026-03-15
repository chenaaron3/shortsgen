"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";

interface Video {
  id: string;
  status: string | null;
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
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card p-4 lg:w-64">
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
          {videos.map((v) => (
            <Link
              key={v.id}
              href={`/runs/${runId}/videos/${v.id}`}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                activeVideoId === v.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-mono">{v.id.slice(0, 8)}</span>
              {revisionLoadingVideoId === v.id && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
            </Link>
          ))}
        </nav>
      )}
    </aside>
  );
}
