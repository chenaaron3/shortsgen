import type { EvalTrace } from "../types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, X, Star } from "lucide-react";

type BatchListProps = {
  traces: EvalTrace[];
  traceReviewed: (trace: EvalTrace) => boolean;
  traceHasDisagreement?: (trace: EvalTrace) => boolean;
  traceInGoldenSet?: (trace: EvalTrace) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function BatchList({
  traces,
  traceReviewed,
  traceHasDisagreement = () => false,
  traceInGoldenSet = () => false,
  selectedId,
  onSelect,
}: BatchListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-3">
        <h3 className="text-sm font-semibold">Traces ({traces.length})</h3>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {traces.map((trace) => {
            const reviewed = traceReviewed(trace);
            const hasDisagreement = traceHasDisagreement(trace);
            const inGoldenSet = traceInGoldenSet(trace);
            return (
              <Button
                key={trace.id}
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-2 px-3 py-2 text-left",
                  selectedId === trace.id && "bg-accent",
                  reviewed && "bg-emerald-50 dark:bg-emerald-950/30"
                )}
                onClick={() => onSelect(trace.id)}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {trace.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {trace.id}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {inGoldenSet && (
                    <Star className="size-3.5 text-amber-500 fill-amber-500" />
                  )}
                  {hasDisagreement ? (
                    <X className="size-3.5 text-red-500" />
                  ) : reviewed ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : null}
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
