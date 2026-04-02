"use client";

import { useRef, type ComponentProps } from "react";

import { useAutosizeTextarea } from "~/hooks/useAutosizeTextarea";
import { cn } from "~/lib/utils";

import { Textarea } from "./textarea";

export type AutosizeTextareaProps = Omit<
  ComponentProps<typeof Textarea>,
  "rows"
> & {
  /** Pixel cap before scrolling; default 320 (Tailwind max-h-80). */
  maxHeightPx?: number;
};

export function AutosizeTextarea({
  maxHeightPx = 320,
  className,
  value,
  ...props
}: AutosizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(ref, String(value ?? ""), maxHeightPx);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn("min-h-9 resize-none", className)}
      {...props}
    />
  );
}
