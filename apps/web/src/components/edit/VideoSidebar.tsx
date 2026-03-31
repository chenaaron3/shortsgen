"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { getVideoDisplayName } from "~/lib/parseVideoChunks";
import { getProgressValue, getStepLabel } from "~/lib/videoProgress";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

import type { RunPhase } from "./RunProgressSteps";

interface Video {
  id: string;
  status: string | null;
  chunks?: unknown;
}

interface VideoSidebarProps {
  runId: string;
  runPhase: RunPhase;
  videos: Video[];
  activeVideoId: string;
  wsStatus: string;
  wsCloseInfo?: { code: number; reason: string } | null;
  /** Video ID showing revision loading indicator (feedback submitted, waiting for apply). */
  revisionLoadingVideoId?: string | null;
}

const SCRIPTING_DELETABLE = new Set(["created", "scripts", "failed"]);

export function VideoSidebar({
  runId,
  runPhase,
  videos,
  activeVideoId,
  wsStatus,
  wsCloseInfo,
  revisionLoadingVideoId,
}: VideoSidebarProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const videoProgressByVideo = useRunStore((s) => s.progress.videoProgressByVideo);

  const [confirmVideoId, setConfirmVideoId] = useState<string | null>(null);

  const deleteMutation = api.runs.deleteVideo.useMutation({
    onSuccess: (data) => {
      setConfirmVideoId(null);
      if (data.runDeleted) {
        void router.push("/");
      }
      void utils.runs.getById.invalidate({ runId });
      void utils.runs.listRunsForUser.invalidate();
    },
  });

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

            const canDeleteDuringScripting =
              runPhase === "scripting" &&
              !!v.status &&
              SCRIPTING_DELETABLE.has(v.status) &&
              !inProgress &&
              !deleteMutation.isPending;

            return (
              <div
                key={v.id}
                className={`group flex items-stretch overflow-hidden rounded-lg ${
                  activeVideoId === v.id
                    ? "bg-accent/80 text-accent-foreground"
                    : "bg-transparent text-muted-foreground"
                }`}
              >
                <Link
                  href={`/runs/${runId}/videos/${v.id}`}
                  className={`relative min-w-0 flex-1 ${
                    activeVideoId === v.id
                      ? "text-accent-foreground"
                      : "hover:bg-muted hover:text-foreground"
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
                {canDeleteDuringScripting && (
                  <button
                    type="button"
                    aria-label="Delete video"
                    className="relative z-10 shrink-0 border-l border-border/40 px-2 text-muted-foreground pointer-events-none opacity-0 transition-[opacity,background-color,color] hover:bg-destructive/15 hover:text-destructive [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                    onClick={() => setConfirmVideoId(v.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      )}

      <Dialog
        open={confirmVideoId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmVideoId(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this video?</DialogTitle>
            <DialogDescription>
              {videos.length <= 1
                ? "This is the only clip in this run. Deleting it will remove the entire run."
                : "This clip will be permanently removed. You cannot undo this."}
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error && (
            <p className="text-sm text-destructive">{deleteMutation.error.message}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmVideoId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !confirmVideoId}
              onClick={() => {
                if (!confirmVideoId) return;
                deleteMutation.mutate({ runId, videoId: confirmVideoId });
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
