"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { getVideoDisplayName } from "~/lib/parseVideoChunks";

interface VideoListItemProps {
  runId: string;
  videoId: string;
  chunks?: unknown;
  placeholderIndex: number;
}

export function VideoListItem({
  runId,
  videoId,
  chunks,
  placeholderIndex,
}: VideoListItemProps) {
  const displayName = getVideoDisplayName({
    id: videoId,
    chunks,
    placeholderIndex,
  });
  return (
    <Link href={`/runs/${runId}/videos/${videoId}`} onClick={(e) => e.stopPropagation()}>
      <Button variant="outline" size="sm" className="h-auto py-1.5 text-xs">
        {displayName}
      </Button>
    </Link>
  );
}
