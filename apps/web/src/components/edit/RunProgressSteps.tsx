"use client";

import { Check } from 'lucide-react';

import { RUN_PHASE_STEPS } from '@shortgen/db';

import type { RunStatus } from "@shortgen/db";
export type RunPhase = RunStatus;

interface RunProgressStepsProps {
  phase: RunPhase;
  breakdownComplete?: boolean;
  /** When true, the export step shows as completed (all videos exported). */
  exportComplete?: boolean;
  className?: string;
  /** Compact mode for navbar (smaller bubbles). Active step shows label; hover reveals others. */
  compact?: boolean;
}

export function RunProgressSteps({
  phase,
  breakdownComplete = false,
  exportComplete = false,
  className,
  compact = false,
}: RunProgressStepsProps) {
  const phaseIndex = RUN_PHASE_STEPS.findIndex((s) => s.key === phase);

  return (
    <div
      className={`group flex items-center gap-2 ${compact ? "gap-1.5" : "gap-4"} ${className ?? ""}`}
    >
      {RUN_PHASE_STEPS.map((step, i) => {
        const isComplete =
          step.key === "breakdown"
            ? breakdownComplete
            : step.key === "export"
              ? exportComplete
              : i < phaseIndex;
        const isActive = step.key === phase;
        const isPast =
          i < phaseIndex ||
          (step.key === "breakdown" && breakdownComplete) ||
          (step.key === "export" && exportComplete);

        return (
          <div
            key={step.key}
            className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}
          >
            <div
              className={`flex shrink-0 items-center justify-center rounded-full border-2 transition-all ${isComplete || isPast
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
            {/* Non-compact: always show labels. Compact: show active label, reveal others on hover */}
            {!compact ? (
              <span
                className={`text-sm ${isActive ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
              >
                {step.label}
              </span>
            ) : (
              <span
                className={`overflow-hidden text-ellipsis whitespace-nowrap text-sm transition-all duration-200 ${isActive
                    ? "max-w-[200px] font-medium text-foreground"
                    : "max-w-0 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 text-muted-foreground"
                  }`}
              >
                {step.label}
              </span>
            )}
            {i < RUN_PHASE_STEPS.length - 1 && (
              <div
                className={`h-px w-4 shrink-0 ${isPast ? "bg-green-500" : "bg-muted-foreground/30"
                  }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
