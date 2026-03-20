"use client";

import { diffWordsWithSpace } from "diff";
import { useMemo } from "react";
import { cn } from "~/lib/utils";

type WordDiffVariant = "script" | "imagery";

interface WordDiffProps {
  before: string;
  after: string;
  variant?: WordDiffVariant;
  className?: string;
}

export function WordDiff({ before, after, variant = "script", className }: WordDiffProps) {
  const parts = useMemo(
    () => diffWordsWithSpace(before, after),
    [before, after],
  );

  const baseStyles =
    variant === "script"
      ? "text-foreground text-sm leading-snug"
      : "text-muted-foreground text-xs";

  return (
    <p
      className={cn(
        "whitespace-pre-wrap wrap-break-word leading-relaxed",
        baseStyles,
        className,
      )}
    >
      {parts.map((part, idx) => (
        <span
          key={idx}
          className={cn(
            part.removed &&
              "text-destructive line-through decoration-destructive/60",
            part.added && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {part.value}
        </span>
      ))}
    </p>
  );
}
