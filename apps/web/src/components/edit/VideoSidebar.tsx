"use client";

interface Video {
  id: string;
  status: string | null;
}

interface VideoSidebarProps {
  videos: Video[];
  selectedVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
  wsStatus: string;
}

export function VideoSidebar({
  videos,
  selectedVideoId,
  onSelectVideo,
  wsStatus,
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
          {wsStatus === "connected" ? "Live" : wsStatus}
        </span>
      </div>
      <h3 className="mb-2 text-sm font-medium text-foreground">Videos</h3>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting for videos…</p>
      ) : (
        <nav className="space-y-1">
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelectVideo(v.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedVideoId === v.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-mono">{v.id.slice(0, 8)}</span>
              <span className="ml-2 text-xs text-muted-foreground">({v.status ?? "preparing"})</span>
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
