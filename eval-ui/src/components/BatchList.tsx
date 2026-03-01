import type { EvalTrace, JudgeResultEntry, Dimension } from "../types";
import { DIMENSIONS, DIMENSION_LABELS } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, X, Star } from "lucide-react";

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

/** Per-criterion pass/fail icons. Uses annotations (latest labels) when available, else judge. Shows ✗✗✗ when all fail. */
function CriteriaIcons({ labelData }: { labelData: Record<Dimension, boolean> }) {
  const allFail = DIMENSIONS.every((d) => !labelData[d]);
  return (
    <div
      className="flex items-center gap-0.5 shrink-0"
      title={DIMENSIONS.map((d) => `${DIMENSION_LABELS[d]}: ${labelData[d] ? "pass" : "fail"}`).join(", ")}
    >
      {allFail ? (
        <span className="text-red-500 font-semibold text-xs" title="All criteria failed">
          ✗✗✗
        </span>
      ) : (
        DIMENSIONS.map((d) => (
          <span key={d} title={`${DIMENSION_LABELS[d]}: ${labelData[d] ? "pass" : "fail"}`}>
            {labelData[d] ? (
              <Check className="size-3 text-emerald-600" />
            ) : (
              <X className="size-3 text-red-500" />
            )}
          </span>
        ))
      )}
    </div>
  );
}

/** Lenient = human fail, judge pass. Strict = human pass, judge fail. Uses humanLabels when available, else entry.expected. */
function MismatchBadge({
  entry,
  humanLabels,
}: {
  entry: JudgeResultEntry;
  humanLabels: Record<Dimension, boolean> | undefined;
}) {
  const groundTruth = humanLabels ?? entry.expected;
  const strict: Dimension[] = [];
  const lenient: Dimension[] = [];
  for (const d of DIMENSIONS) {
    if (groundTruth[d] !== entry.predicted[d]) {
      if (groundTruth[d] && !entry.predicted[d]) strict.push(d);
      else lenient.push(d);
    }
  }
  if (strict.length === 0 && lenient.length === 0) return null;
  const parts: string[] = [];
  if (lenient.length > 0) parts.push(`↗ ${lenient.map((d) => DIM_SHORT[d]).join(",")}`);
  if (strict.length > 0) parts.push(`↘ ${strict.map((d) => DIM_SHORT[d]).join(",")}`);
  const labelSrc = humanLabels ? "Human" : "Expected";
  const title = [
    lenient.length > 0 && `Lenient (judge passed, ${labelSrc} fail): ${lenient.map((d) => DIMENSION_LABELS[d]).join(", ")}`,
    strict.length > 0 && `Strict (judge failed, ${labelSrc} pass): ${strict.map((d) => DIMENSION_LABELS[d]).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="text-[10px] text-amber-600 dark:text-amber-500" title={title}>
      {parts.join(" | ")}
    </span>
  );
}

export type DatasetFilter = "all" | "golden" | "holdout";

type BatchListProps = {
  traces: EvalTrace[];
  traceReviewed: (trace: EvalTrace) => boolean;
  traceHasDisagreement?: (trace: EvalTrace) => boolean;
  traceInGoldenSet?: (trace: EvalTrace) => boolean;
  /** Human labels when source is human. Used for criteria icons and mismatch badge. Falls back to judge predicted for icons. */
  getHumanLabelData?: (trace: EvalTrace) => Record<Dimension, boolean> | undefined;
  /** Judge result for mismatch badge (lenient/strict). */
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
  getHumanLabelData,
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
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {traces.map((trace) => {
            const reviewed = traceReviewed(trace);
            const hasDisagreement = traceHasDisagreement(trace);
            const inGoldenSet = traceInGoldenSet(trace);
            const source = trace.sourceType ?? "ai";
            const judgeEntry = getJudgeEntry?.(trace);
            const labelData = getHumanLabelData?.(trace) ?? getJudgeEntry?.(trace)?.predicted;
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
                    {judgeEntry &&
                      (() => {
                        const humanLabels = getHumanLabelData?.(trace);
                        const groundTruth = humanLabels ?? judgeEntry.expected;
                        const hasMismatch = DIMENSIONS.some(
                          (d) => groundTruth[d] !== judgeEntry.predicted[d]
                        );
                        return hasMismatch ? (
                          <MismatchBadge entry={judgeEntry} humanLabels={humanLabels} />
                        ) : null;
                      })()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {labelData && <CriteriaIcons labelData={labelData} />}
                  {inGoldenSet && (
                    <Star className="size-3.5 text-amber-500 fill-amber-500" />
                  )}
                  {hasDisagreement ? (
                    <span title="Judge disagrees with expected">
                      <X className="size-3.5 text-red-500" />
                    </span>
                  ) : reviewed ? (
                    <span title="Human reviewed">
                      <Check className="size-3.5 text-emerald-500" />
                    </span>
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
