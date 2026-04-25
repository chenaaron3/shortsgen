"use client";

import * as React from "react";
import { cn } from "~/lib/utils";

interface HoverBorderGradientProps extends React.ComponentProps<"div"> {
  containerClassName?: string;
  className?: string;
  duration?: number;
  clockwise?: boolean;
  disabled?: boolean;
}

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  duration = 1,
  clockwise = true,
  disabled = false,
  ...props
}: HoverBorderGradientProps) {
  return (
    <div
      className={cn(
        "group/hbg relative overflow-hidden rounded-xl p-px",
        containerClassName,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300",
          disabled
            ? "opacity-0"
            : "opacity-0 group-hover/hbg:opacity-100 group-focus-visible/hbg:opacity-100 group-focus-within/hbg:opacity-100",
        )}
      >
        <span
          className={cn(
            "absolute inset-[-180%] animate-spin rounded-[inherit] bg-[conic-gradient(from_0deg,hsl(var(--primary)/0.04)_0deg,hsl(var(--primary)/0.95)_90deg,hsl(var(--primary)/0.04)_180deg,hsl(var(--primary)/0)_360deg)]",
            !clockwise && "direction-[reverse]",
          )}
          style={{ animationDuration: `${duration}s` }}
        />
      </span>
      <span className={cn("relative block rounded-[inherit]", className)}>
        {children}
      </span>
    </div>
  );
}
