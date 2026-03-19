"use client";

import { useEffect, useState } from 'react';
import { DotLoader } from 'react-spinners';

const FALLBACK_MESSAGES = [
  "Identifying topics…",
  "Preparing clips…",
  "Almost ready…",
];

const CYCLE_INTERVAL_MS = 2500;

interface BreakdownHeroProps {
  complete?: boolean;
  className?: string;
  /** Contextual messages from LLM. Falls back to static list if empty. */
  messages?: string[] | null;
}

export function BreakdownHero({
  complete = false,
  className,
  messages,
}: BreakdownHeroProps) {
  const list = messages?.length ? messages : FALLBACK_MESSAGES;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % list.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [complete, list.length]);

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
          : list[messageIndex]}
      </p>
      {!complete && (
        <DotLoader color="var(--primary)" size={28} speedMultiplier={1.2} />
      )}
    </div>
  );
}
