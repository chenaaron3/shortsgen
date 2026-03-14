"use client";

import Link from "next/link";
import { api } from "~/utils/api";
import { RunCard } from "./RunCard";

export function RunList() {
  const { data, isLoading, error } = api.runs.listRunsForUser.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        Loading runs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
        {error.message}
      </div>
    );
  }

  const runs = data?.runs ?? [];

  return (
    <div className="space-y-4">
      {runs.length === 0 ? (
        <p className="text-center text-muted-foreground">No runs yet. Create your first video!</p>
      ) : (
        runs.map((run) => <RunCard key={run.id} run={run} />)
      )}
    </div>
  );
}
