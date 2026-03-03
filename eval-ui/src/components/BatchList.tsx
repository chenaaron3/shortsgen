import type { EvalTrace, JudgeResultEntry, Dimension } from "../types";
import { DIMENSIONS, DIMENSION_LABELS } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Star } from "lucide-react";

const DIM_SHORT: Record<Dimension, string> = {
  engagement: "E",
  clarity: "C",
  payoff: "P",
};

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

/** Pass/fail counts per dimension from judge predictions. */
function DimensionPassFailBreakdown({
  traces,
  getJudgeEntry,
}: {
  traces: EvalTrace[];
  getJudgeEntry?: (trace: EvalTrace) => JudgeResultEntry | undefined;
}) {
  if (!getJudgeEntry) return null;
  const counts: Record<Dimension, { pass: number; fail: number }> = {
    engagement: { pass: 0, fail: 0 },
    clarity: { pass: 0, fail: 0 },
    payoff: { pass: 0, fail: 0 },
  };
  for (const t of traces) {
    const entry = getJudgeEntry(t);
    if (!entry?.predicted) continue;
    for (const d of DIMENSIONS) {
      if (entry.predicted[d]) counts[d].pass++;
      else counts[d].fail++;
    }
  }
  const total = traces.filter((t) => getJudgeEntry(t)?.predicted).length;
  if (total === 0) return null;
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      {DIMENSIONS.map((d) => (
        <p key={d}>
          {DIMENSION_LABELS[d]}: {counts[d].pass} pass, {counts[d].fail} fail
        </p>
      ))}
    </div>
  );
}

/** Per-dimension badges: green if pass, red if fail. Yellow ring on disagreed dimensions. */
function CriteriaBadges({
  labelData,
  disagreedDimensions = [],
}: {
  labelData: Record<Dimension, boolean> | undefined;
  disagreedDimensions?: Dimension[];
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {DIMENSIONS.map((d) => {
        const pass = labelData?.[d];
        const hasData = pass !== undefined;
        const hasDisagreement = disagreedDimensions.includes(d);
        return (
          <Badge
            key={d}
            variant="secondary"
            className={cn(
              "text-[10px] px-1 py-0 w-5 justify-center font-medium",
              hasData
                ? pass
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                  : "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                : "bg-muted text-muted-foreground",
              hasDisagreement && "ring-2 ring-yellow-500 ring-inset"
            )}
            title={
              hasDisagreement
                ? `${DIMENSION_LABELS[d]}: judge disagrees with expected`
                : hasData
                  ? `${DIMENSION_LABELS[d]}: ${pass ? "pass" : "fail"}`
                  : `${DIMENSION_LABELS[d]}: no evaluation`
            }
          >
            {DIM_SHORT[d]}
          </Badge>
        );
      })}
    </div>
  );
}

export type DatasetFilter = "all" | "golden" | "holdout";

type BatchListProps = {
  traces: EvalTrace[];
  traceReviewed: (trace: EvalTrace) => boolean;
  traceHasDisagreement?: (trace: EvalTrace) => boolean;
  traceInGoldenSet?: (trace: EvalTrace) => boolean;
  /** Best available labels for E/C/P badges: human > judge > annotations. */
  getLabelData?: (trace: EvalTrace) => Record<Dimension, boolean> | undefined;
  /** Dimensions where judge disagrees with expected (for per-badge yellow ring). */
  getDisagreedDimensions?: (trace: EvalTrace) => Dimension[];
  /** Judge result for DimensionPassFailBreakdown. */
  getJudgeEntry?: (trace: EvalTrace) => JudgeResultEntry | undefined;
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
  getLabelData,
  getDisagreedDimensions,
  getJudgeEntry,
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
        {traces.length > 0 && (
          <DimensionPassFailBreakdown traces={traces} getJudgeEntry={getJudgeEntry} />
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {traces.map((trace) => {
            const reviewed = traceReviewed(trace);
            const hasDisagreement = traceHasDisagreement(trace);
            const inGoldenSet = traceInGoldenSet(trace);
            const source = trace.sourceType ?? "ai";
            const labelData = getLabelData?.(trace);
            const disagreedDimensions = getDisagreedDimensions?.(trace) ?? [];
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
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <Badge
                      variant={source === "youtube" ? "default" : "secondary"}
                      className={cn(
                        "text-[10px] px-1.5 py-0 w-fit",
                        source === "youtube"
                          ? "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                          : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
                      )}
                    >
                      {source === "youtube" ? "YouTube" : "AI"}
                    </Badge>
                    <CriteriaBadges
                      labelData={labelData}
                      disagreedDimensions={disagreedDimensions}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {inGoldenSet && (
                    <Star className="size-3.5 text-amber-500 fill-amber-500" />
                  )}
                  {!hasDisagreement && reviewed && (
                    <span title="Human reviewed">
                      <Check className="size-3.5 text-emerald-500" />
                    </span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
