"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";

interface VideoListItemProps {
  runId: string;
  videoId: string;
  status: string;
}

export function VideoListItem({ runId, videoId, status }: VideoListItemProps) {
  return (
    <Link href={`/runs/${runId}/videos/${videoId}`}>
      <Button variant="outline" size="sm" className="h-auto py-1.5 font-mono text-xs">
        {videoId.slice(0, 8)}
        <span className="ml-2 text-muted-foreground">({status})</span>
      </Button>
    </Link>
  );
}
