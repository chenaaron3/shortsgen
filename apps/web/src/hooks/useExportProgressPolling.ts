"use client";

import { useEffect, useMemo } from "react";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

interface Video {
  id: string;
  status: string | null;
  render_id?: string | null;
}

/**
 * Polls getExportProgress for videos with status "exporting" and render_id.
 * Updates videoProgressByVideo and refetches run when a render completes.
 */
export function useExportProgressPolling(
  runId: string,
  videos: Video[],
  refetch: () => void,
) {
  const utils = api.useUtils();
  const setVideoProgress = useRunStore((s) => s.setVideoProgress);

  const toPoll = useMemo(
    () => videos.filter((v) => v.status === "exporting" && v.render_id),
    [videos],
  );
  const toPollKey = toPoll.map((v) => v.id).join(",");

  useEffect(() => {
    if (toPoll.length === 0) return;

    const run = async () => {
      for (const v of toPoll) {
        try {
          const data = await utils.runs.getExportProgress.fetch({
            runId,
            videoId: v.id,
          });
          if (data.done || data.fatalErrorEncountered) {
            setVideoProgress(v.id, null);
            refetch();
            void utils.runs.getVideoAssets.invalidate({ runId, videoId: v.id });
          } else if ("_retrySync" in data && data._retrySync) {
            refetch();
          } else {
            const p = data.overallProgress;
            setVideoProgress(v.id, {
              workflow: "export",
              progress: p,
              statusMessage:
                p < 1 ? `Rendering ${Math.round(p * 100)}%` : "Rendering…",
            });
          }
        } catch {
          // Ignore transient errors; will retry next interval
        }
      }
    };

    void run();
    const iv = setInterval(run, 2000);
    return () => clearInterval(iv);
  }, [runId, toPollKey, toPoll, setVideoProgress, utils, refetch]);
}
