"use client";

import { api } from "~/utils/api";
import { Button } from "~/components/ui/button";

interface RunLogsModalProps {
  open: boolean;
  onClose: () => void;
  runId: string;
  /** When provided, shows run-level logs + this video's logs. */
  videoId?: string | null;
}

export function RunLogsModal({ open, onClose, runId, videoId }: RunLogsModalProps) {
  const runLogsQuery = api.admin.getRunLogs.useQuery(
    { runId, videoId: videoId ?? undefined },
    { enabled: !!runId && open }
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-lg font-medium">
            {videoId ? `Logs for video ${videoId.slice(0, 8)}` : "Run logs"}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {runLogsQuery.isLoading && (
            <p className="text-muted-foreground">Loading logs…</p>
          )}
          {runLogsQuery.isError && (
            <p className="text-destructive">{runLogsQuery.error?.message}</p>
          )}
          {runLogsQuery.data?.error && (
            <p className="text-destructive">{runLogsQuery.data.error}</p>
          )}
          {runLogsQuery.data?.logs &&
            runLogsQuery.data.logs.length === 0 &&
            !runLogsQuery.data.error && (
              <p className="text-muted-foreground">No logs found for this run.</p>
            )}
          {runLogsQuery.data?.logs && runLogsQuery.data.logs.length > 0 && (
            <div className="space-y-2 font-mono text-xs">
              {runLogsQuery.data.logs.map((log, i) => (
                <div
                  key={i}
                  className="rounded border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="mb-1 flex flex-wrap gap-2 text-muted-foreground">
                    <span>{log.timestamp}</span>
                    <span>{log.logStream}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words">{log.message}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
