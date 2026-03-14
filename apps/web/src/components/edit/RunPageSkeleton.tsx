"use client";

import { Skeleton } from "~/components/ui/skeleton";

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
