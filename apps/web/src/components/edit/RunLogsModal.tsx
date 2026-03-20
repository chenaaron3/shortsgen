"use client";

import { useCallback, useMemo, useState } from "react";
import { api } from "~/utils/api";
import { Button } from "~/components/ui/button";
import { TreeView, type TreeDataItem } from "~/components/tree-view";

interface RunLogsModalProps {
  open: boolean;
  onClose: () => void;
  runId: string;
  /** When provided, shows run-level logs + this video's logs. */
  videoId?: string | null;
}

type Tab = "logs" | "artifacts";

export function RunLogsModal({ open, onClose, runId, videoId }: RunLogsModalProps) {
  const [tab, setTab] = useState<Tab>("logs");

  const runLogsQuery = api.admin.getRunLogs.useQuery(
    { runId, videoId: videoId ?? undefined },
    { enabled: !!runId && open && tab === "logs" }
  );

  const listArtifactsQuery = api.admin.listArtifacts.useQuery(
    { runId },
    { enabled: !!runId && open && tab === "artifacts" }
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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">
              {videoId ? `Logs for video ${videoId.slice(0, 8)}` : "Run logs"}
            </h3>
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              <Button
                variant={tab === "logs" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTab("logs")}
              >
                Logs
              </Button>
              <Button
                variant={tab === "artifacts" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTab("artifacts")}
              >
                Artifacts
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {tab === "logs" && (
            <>
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
            </>
          )}
          {tab === "artifacts" && (
            <ArtifactsTab runId={runId} query={listArtifactsQuery} />
          )}
        </div>
      </div>
    </div>
  );
}

function keysToTree(
  keys: string[],
  onFileClick: (path: string) => void,
  loadingPath: string | null
): TreeDataItem[] {
  type NodeMap = Map<string, { path: string; children?: NodeMap }>;
  const root: NodeMap = new Map();

  for (const key of keys) {
    const parts = key.split("/").filter(Boolean);
    let current = root;
    let pathSoFar = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      const isLeaf = i === parts.length - 1;

      if (!current.has(part)) {
        current.set(part, { path: pathSoFar, children: isLeaf ? undefined : new Map() });
      }
      const node = current.get(part)!;
      if (!isLeaf) {
        if (!node.children) node.children = new Map();
        current = node.children;
      }
    }
  }

  function toTreeItems(map: NodeMap): TreeDataItem[] {
    const items: TreeDataItem[] = [];
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [name, node] of entries) {
      const isFolder = node.children !== undefined && node.children.size > 0;
      items.push({
        id: node.path,
        name,
        children: isFolder ? toTreeItems(node.children!) : undefined,
        onClick: isFolder ? undefined : () => onFileClick(node.path),
        disabled: !isFolder && loadingPath === node.path,
      });
    }
    return items;
  }

  return toTreeItems(root);
}

function ArtifactsTab({
  runId,
  query,
}: {
  runId: string;
  query: { data?: { keys?: string[]; error?: string }; isLoading: boolean; isError: boolean; error: unknown };
}) {
  const utils = api.useUtils();
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const keys = query.data?.keys ?? [];

  const handleClick = useCallback(
    async (path: string) => {
      setLoadingPath(path);
      try {
        const result = await utils.admin.getArtifactUrl.fetch({ runId, path });
        if (result.url) {
          window.open(result.url, "_blank", "noopener,noreferrer");
        }
      } finally {
        setLoadingPath(null);
      }
    },
    [runId, utils]
  );

  const treeData = useMemo(
    () => keysToTree(keys, handleClick, loadingPath),
    [keys, handleClick, loadingPath]
  );

  if (query.isLoading) {
    return <p className="text-muted-foreground">Loading artifacts…</p>;
  }
  if (query.isError) {
    const msg = query.error instanceof Error ? query.error.message : String(query.error);
    return <p className="text-destructive">{msg}</p>;
  }
  if (query.data?.error) {
    return <p className="text-destructive">{query.data.error}</p>;
  }
  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground">
        No artifacts found. Artifacts are uploaded as the pipeline runs.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Click a file to open in a new tab (read-only).
      </p>
      <TreeView data={treeData} expandAll className="font-mono text-sm" />
    </div>
  );
}
