"use client";

import Link from 'next/link';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader } from '~/components/ui/card';

import { VideoListItem } from './VideoListItem';

import type { RouterOutputs } from "~/utils/api";

type RunFromList = RouterOutputs["runs"]["listRunsForUser"]["runs"][number];
type RunWithVideos = RunFromList & {
  videos: Array<{
    id: string;
    status: string | null;
    run_id: string;
    chunks?: unknown;
  }>;
};

interface RunCardProps {
  run: RunFromList;
}

export function RunCard({ run }: RunCardProps) {
  const runWithVideos = run as RunWithVideos;
  const videos = runWithVideos.videos ?? [];
  const displayTitle =
    run.title?.trim() ||
    (run.user_input.length > 120
      ? run.user_input.slice(0, 120) + "..."
      : run.user_input);
  const dateStr = run.created_at
    ? new Date(run.created_at).toLocaleDateString()
    : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground line-clamp-2">{displayTitle}</p>
        <Link href={`/runs/${run.id}`}>
          <Button variant="secondary" size="sm">Edit</Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{run.status}</span>
          <span>·</span>
          <span>{dateStr}</span>
          <span>·</span>
          <span>{videos.length} video{videos.length !== 1 ? "s" : ""}</span>
        </div>
        {videos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {videos.map((v) => (
              <VideoListItem
                key={v.id}
                runId={run.id}
                videoId={v.id}
                status={v.status ?? "preparing"}
                chunks={v.chunks}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
