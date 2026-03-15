"use client";

import Link from "next/link";

export function RunNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <p>Run not found</p>
      <Link href="/" className="text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
    </div>
  );
}
