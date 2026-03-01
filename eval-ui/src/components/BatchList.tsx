import type { EvalTrace } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, X, Star } from "lucide-react";

function SourceBreakdown({ traces }: { traces: EvalTrace[] }) {
  const ai = traces.filter((t) => (t.sourceType ?? "ai") === "ai").length;
  const youtube = traces.filter((t) => t.sourceType === "youtube").length;
  const unknown = traces.length - ai - youtube;
  const parts = [
    ai > 0 && `AI: ${ai}`,
    youtube > 0 && `YouTube: ${youtube}`,
    unknown > 0 && `Unknown: ${unknown}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>
  );
}

export type DatasetFilter = "all" | "golden" | "holdout";

type BatchListProps = {
  traces: EvalTrace[];
  traceReviewed: (trace: EvalTrace) => boolean;
  traceHasDisagreement?: (trace: EvalTrace) => boolean;
  traceInGoldenSet?: (trace: EvalTrace) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  datasetFilter?: DatasetFilter;
  onDatasetFilterChange?: (f: DatasetFilter) => void;
};

export function BatchList({
  traces,
  traceReviewed,
  traceHasDisagreement = () => false,
  traceInGoldenSet = () => false,
  selectedId,
  onSelect,
  datasetFilter = "all",
  onDatasetFilterChange,
}: BatchListProps) {
  return (
    <div className="flex h-full flex-col">
      {onDatasetFilterChange && (
        <div className="flex shrink-0 border-b p-2 gap-1">
          {(["all", "golden", "holdout"] as const).map((f) => (
            <Button
              key={f}
              variant={datasetFilter === f ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => onDatasetFilterChange(f)}
            >
              {f === "all" ? "All" : f === "golden" ? "Golden" : "Holdout"}
            </Button>
          ))}
        </div>
      )}
      <div className="shrink-0 p-3 space-y-1">
        <h3 className="text-sm font-semibold">Traces ({traces.length})</h3>
        {traces.length > 0 && <SourceBreakdown traces={traces} />}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {traces.map((trace) => {
            const reviewed = traceReviewed(trace);
            const hasDisagreement = traceHasDisagreement(trace);
            const inGoldenSet = traceInGoldenSet(trace);
            const source = trace.sourceType ?? "ai";
            return (
              <Button
                key={trace.id}
                variant="ghost"
                className={cn(
                  "h-auto w-full min-w-0 justify-start gap-2 overflow-hidden px-3 py-2 text-left",
                  selectedId === trace.id && "bg-accent",
                  reviewed && "bg-emerald-50 dark:bg-emerald-950/30"
                )}
                onClick={() => onSelect(trace.id)}
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-sm font-medium">
                    {trace.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {trace.id}
                  </span>
                  <Badge
                    variant={source === "youtube" ? "default" : "secondary"}
                    className={cn(
                      "mt-1 text-[10px] px-1.5 py-0 w-fit",
                      source === "youtube"
                        ? "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
                    )}
                  >
                    {source === "youtube" ? "YouTube" : "AI"}
                  </Badge>
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
