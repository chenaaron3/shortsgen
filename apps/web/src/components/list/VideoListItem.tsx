"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { getVideoDisplayName } from "~/lib/parseVideoChunks";

interface VideoListItemProps {
  runId: string;
  videoId: string;
  chunks?: unknown;
}

export function VideoListItem({ runId, videoId, chunks }: VideoListItemProps) {
  const displayName = getVideoDisplayName({ id: videoId, chunks });
  return (
    <Link href={`/runs/${runId}/videos/${videoId}`} onClick={(e) => e.stopPropagation()}>
      <Button variant="outline" size="sm" className="h-auto py-1.5 font-mono text-xs">
        {displayName}
      </Button>
    </Link>
  );
}
