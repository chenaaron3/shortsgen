"use client";

import { useEffect, useState } from "react";

const BREAKDOWN_MESSAGES = [
  "Identifying topics…",
  "Preparing clips…",
  "Almost ready…",
];

const CYCLE_INTERVAL_MS = 2500;

interface BreakdownHeroProps {
  /** When true, show completion state instead of cycling messages. */
  complete?: boolean;
  className?: string;
}

export function BreakdownHero({ complete = false, className }: BreakdownHeroProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % BREAKDOWN_MESSAGES.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [complete]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-6 text-center ${className ?? ""}`}
    >
      <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {complete ? "Breakdown complete" : "Analysing your content"}
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        {complete
          ? "Your clips are ready. Select a video to edit scripts and imagery."
          : BREAKDOWN_MESSAGES[messageIndex]}
      </p>
      {!complete && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      )}
    </div>
  );
}
