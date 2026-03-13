import * as Diff from "diff";
import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { Dimension, ScriptJudgeAttempt, ScriptJudgeResults } from "../types";
import { DIMENSION_LABELS } from "../types";

type JudgeGateAttemptsProps = {
  traceId: string;
  assetHash: string | undefined;
};

function assetBase(traceId: string, assetHash: string): string {
  return `/eval-assets/${traceId}/${assetHash}`;
}

/** Renders a line-by-line diff between two script strings */
function ScriptDiff({ fromScript, toScript }: { fromScript: string; toScript: string }) {
  const changes = Diff.diffLines(fromScript, toScript);

  return (
    <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs font-mono overflow-x-auto">
      {changes.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="block bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/25">
              {part.value.split("\n").map((line, j) => (
                <span key={j} className="block pl-1 border-l-2 border-emerald-500">
                  + {line || " "}
                </span>
              ))}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="block bg-red-500/20 text-red-800 dark:text-red-200 dark:bg-red-500/25">
              {part.value.split("\n").map((line, j) => (
                <span key={j} className="block pl-1 border-l-2 border-red-500">
                  − {line || " "}
                </span>
              ))}
            </span>
          );
        }
        return (
          <span key={i} className="text-muted-foreground">
            {part.value}
          </span>
        );
      })}
    </pre>
  );
}

export function JudgeGateAttempts({ traceId, assetHash }: JudgeGateAttemptsProps) {
  const [data, setData] = useState<ScriptJudgeResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);

  useEffect(() => {
    if (!traceId || !assetHash) {
      setData(null);
      setError(null);
      return;
    }
    setData(null);
    setError(null);
    fetch(`${assetBase(traceId, assetHash)}/script-judge-results.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((json) => setData(json as ScriptJudgeResults))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [traceId, assetHash]);

  if (error) return null;
  if (!data?.attempts || data.attempts.length <= 1) return null;

  const attempts = data.attempts;
  const selectedIdx = data.selectedIndex ?? attempts.length - 1;
  const dims: Dimension[] = ["engagement", "clarity", "payoff"];

  return (
    <Card className="ring-1 ring-violet-200 dark:ring-violet-900/50">
      <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left hover:bg-muted/50"
          >
            <CardHeader className="p-0">
              <div className="flex items-center gap-2">
                <RotateCcw className="size-4 text-violet-600 dark:text-violet-400" />
                <CardTitle className="text-base">
                  Judge gate attempts ({attempts.length} attempts, selected #{selectedIdx + 1})
                </CardTitle>
              </div>
              {data.judgeModel && (
                <p className="text-xs text-muted-foreground mt-1">{data.judgeModel}</p>
              )}
            </CardHeader>
            {sectionOpen ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {attempts.map((attempt, idx) => (
              <AttemptCard
                key={idx}
                attempt={attempt}
                index={idx}
                prevScript={idx > 0 ? attempts[idx - 1].script : ""}
                isSelected={idx === selectedIdx}
                dims={dims}
                isExpanded={expandedAttempt === idx}
                onToggleExpand={() =>
                  setExpandedAttempt((prev) => (prev === idx ? null : idx))
                }
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

type AttemptCardProps = {
  attempt: ScriptJudgeAttempt;
  index: number;
  prevScript: string;
  isSelected: boolean;
  dims: Dimension[];
  isExpanded: boolean;
  onToggleExpand: () => void;
};

function AttemptCard({
  attempt,
  index,
  prevScript,
  isSelected,
  dims,
  isExpanded,
  onToggleExpand,
}: AttemptCardProps) {
  const judge = attempt.judge;

  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm",
        isSelected
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-600"
          : "border-muted bg-muted/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">Attempt #{index + 1}</span>
          {isSelected && (
            <Badge variant="default" className="text-xs">
              selected
            </Badge>
          )}
          {dims.map((dim) => {
            const passed = judge[dim]?.pass ?? false;
            return (
              <Badge
                key={dim}
                variant={passed ? "outline" : "destructive"}
                className={cn(
                  "text-[10px]",
                  passed && "border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-600 dark:border-emerald-600"
                )}
              >
                {passed ? (
                  <Check className="mr-0.5 size-2.5" />
                ) : (
                  <X className="mr-0.5 size-2.5" />
                )}
                {DIMENSION_LABELS[dim]}
              </Badge>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleExpand}
        className="mt-2 w-full text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? "Hide" : index === 0 ? "Show script" : "Show diff from previous"}
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {index === 0 ? (
            <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs font-normal">
              {attempt.script}
            </pre>
          ) : (
            <ScriptDiff fromScript={prevScript} toScript={attempt.script} />
          )}
          {dims.some((d) => judge[d]?.critique) && (
            <div className="space-y-1.5 border-t pt-2">
              {dims.map(
                (dim) =>
                  judge[dim]?.critique && (
                    <div key={dim} className="text-xs">
                      <span className="font-medium text-muted-foreground">
                        {DIMENSION_LABELS[dim]}:
                      </span>{" "}
                      {judge[dim].critique}
                      {judge[dim]?.suggestion && (
                        <div className="mt-0.5 pl-2 border-l-2 border-muted-foreground/30 italic">
                          Suggestion: {judge[dim].suggestion}
                        </div>
                      )}
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
