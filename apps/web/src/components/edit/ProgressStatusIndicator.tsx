"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

const BREAKDOWN_MESSAGES = [
  "Breaking down your content…",
  "Identifying topics…",
  "Preparing clips…",
  "Almost ready…",
];

const CYCLE_INTERVAL_MS = 2500;

export type ProgressPhase =
  | "idle"
  | "breakdown"
  | "breakdown_done"
  | "clips"
  | "done";

interface ProgressStatusIndicatorProps {
  phase: ProgressPhase;
  className?: string;
}

export function ProgressStatusIndicator({ phase, className }: ProgressStatusIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (phase !== "breakdown") return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % BREAKDOWN_MESSAGES.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "idle" || phase === "done") return null;

  if (phase === "breakdown") {
    return (
      <div
        className={`flex items-center gap-2 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        <span>{BREAKDOWN_MESSAGES[messageIndex]}</span>
      </div>
    );
  }

  if (phase === "breakdown_done") {
    return (
      <div
        className={`flex items-center gap-2 text-sm text-green-600 dark:text-green-500 ${className ?? ""}`}
      >
        <Check className="h-4 w-4 shrink-0" />
        <span>Breakdown complete</span>
      </div>
    );
  }

  if (phase === "clips") {
    return (
      <div
        className={`flex items-center gap-2 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        <span>Processing clips…</span>
      </div>
    );
  }

  return null;
}
