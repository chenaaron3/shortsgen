"use client";

import { Check } from "lucide-react";

export type RunPhase = "breakdown" | "scripting" | "asset_gen" | "exporting";

const STEPS: { key: RunPhase; label: string }[] = [
  { key: "breakdown", label: "Breakdown" },
  { key: "scripting", label: "Scripting" },
  { key: "asset_gen", label: "Asset Gen" },
  { key: "exporting", label: "Exporting" },
];

interface RunProgressStepsProps {
  phase: RunPhase;
  breakdownComplete?: boolean;
  className?: string;
  /** Compact mode for navbar (smaller bubbles). */
  compact?: boolean;
}

export function RunProgressSteps({
  phase,
  breakdownComplete = false,
  className,
  compact = false,
}: RunProgressStepsProps) {
  const phaseIndex = STEPS.findIndex((s) => s.key === phase);

  return (
    <div
      className={`flex items-center gap-2 ${compact ? "gap-1.5" : "gap-4"} ${className ?? ""}`}
    >
      {STEPS.map((step, i) => {
        const isComplete = step.key === "breakdown" ? breakdownComplete : i < phaseIndex;
        const isActive = step.key === phase;
        const isPast = i < phaseIndex || (step.key === "breakdown" && breakdownComplete);

        return (
          <div
            key={step.key}
            className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}
          >
            <div
              className={`flex shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                isComplete || isPast
                  ? "border-green-500 bg-green-500 text-white"
                  : isActive
                    ? "border-primary bg-primary/20 text-primary animate-pulse"
                    : "border-muted-foreground/40 bg-transparent text-muted-foreground"
              } ${compact ? "h-5 w-5" : "h-7 w-7"}`}
            >
              {isComplete || isPast ? (
                <Check className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
              ) : (
                <span className={`font-medium ${compact ? "text-[10px]" : "text-xs"}`}>
                  {i + 1}
                </span>
              )}
            </div>
            {!compact && (
              <span
                className={`text-sm ${
                  isActive ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            )}
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-4 shrink-0 ${
                  isPast ? "bg-green-500" : "bg-muted-foreground/30"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
