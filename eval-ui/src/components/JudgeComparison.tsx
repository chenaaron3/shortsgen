import type { Dimension, JudgeResultEntry } from "../types";
import { DIMENSION_LABELS } from "../types";
import { AlertTriangle, Check, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type JudgeComparisonProps = {
  judgeResult: JudgeResultEntry;
  /** Human pass/fail per dimension (from annotation) */
  humanJudgments: Record<Dimension, { pass: boolean; critique: string } | undefined>;
};

export function JudgeComparison({ judgeResult, humanJudgments }: JudgeComparisonProps) {
  const dims: Dimension[] = ["engagement", "clarity", "payoff"];

  return (
    <Card className="ring-1 ring-amber-200 dark:ring-amber-900/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500" />
          <CardTitle className="text-base">Judge vs Human</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Compare LLM judge predictions with your labels to spot human or judge errors.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-2 font-medium">Dimension</th>
                <th className="py-2 pr-2 font-medium">Human</th>
                <th className="py-2 pr-2 font-medium">Judge</th>
                <th className="py-2 font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {dims.map((dim) => {
                const human = humanJudgments[dim]?.pass;
                const judge = judgeResult.predicted[dim];
                const agree = human !== undefined && judge === human;
                return (
                  <tr
                    key={dim}
                    className={cn(
                      "border-b last:border-0",
                      !agree && "bg-destructive/5 dark:bg-destructive/10"
                    )}
                  >
                    <td className="py-2 pr-2 font-medium">{DIMENSION_LABELS[dim]}</td>
                    <td className="py-2 pr-2">
                      {human === true ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                          <Check className="size-3.5" /> PASS
                        </span>
                      ) : human === false ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <X className="size-3.5" /> FAIL
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {judge === true ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                          <Check className="size-3.5" /> PASS
                        </span>
                      ) : judge === false ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <X className="size-3.5" /> FAIL
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {human !== undefined ? (
                        agree ? (
                          <span className="text-emerald-600 dark:text-emerald-500">✓</span>
                        ) : (
                          <span className="font-medium text-destructive">✗ disagree</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {judgeResult.disagreements.length > 0 && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Judge&apos;s critiques (where it disagreed):</p>
            {judgeResult.disagreements.map((dim) => (
              <div key={dim} className="text-xs">
                <span className="font-medium">{DIMENSION_LABELS[dim]}:</span>{" "}
                {judgeResult.critiques[dim] || "(no critique)"}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
