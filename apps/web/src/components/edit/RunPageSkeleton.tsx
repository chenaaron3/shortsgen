"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

const DEFAULT_SCRIPTING_PLACEHOLDER_ROWS = 4;

/** Single row matching SceneRow layout (script + imagery lines + thumbnail sliver). */
export function SceneRowSkeleton() {
  return (
    <Card size="sm" className="py-2 ring-0">
      <CardContent className="pt-2">
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="min-h-[48px] w-full rounded-md" />
          </div>
          <Skeleton className="h-20 w-14 shrink-0 rounded-md border border-border" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Stacked scene placeholders while scripting and chunks are not ready yet. */
export function ScriptingScenesSkeleton({ rowCount = DEFAULT_SCRIPTING_PLACEHOLDER_ROWS }: { rowCount?: number }) {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading scenes…</span>
      {Array.from({ length: rowCount }).map((_, i) => (
        <SceneRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function MainContentSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-6 w-48" />
      <div className="mb-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-border pt-6">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
      <div className="mt-6">
        <Skeleton className="h-10 w-32" />
      </div>
    </>
  );
}

export function RunPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      {/* Sidebar skeleton */}
      <aside className="w-56 shrink-0 border-r border-border bg-card p-4 lg:w-64">
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="mb-2 h-4 w-16" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex flex-1 flex-col overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>

        <MainContentSkeleton />
      </main>
    </div>
  );
}
