"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { getVideoDisplayName } from "~/lib/parseVideoChunks";

interface VideoListItemProps {
  runId: string;
  videoId: string;
  status: string;
  chunks?: unknown;
}

export function VideoListItem({ runId, videoId, status, chunks }: VideoListItemProps) {
  const displayName = getVideoDisplayName({ id: videoId, chunks });
  return (
    <Link href={`/runs/${runId}/videos/${videoId}`}>
      <Button variant="outline" size="sm" className="h-auto py-1.5 font-mono text-xs">
        {displayName}
        <span className="ml-2 text-muted-foreground">({status})</span>
      </Button>
    </Link>
  );
}
