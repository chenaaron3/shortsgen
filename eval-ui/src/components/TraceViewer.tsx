import { useState } from "react";
import type { EvalTrace } from "../types";
import { parseScript } from "../lib/parseScript";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
type TraceViewerProps = {
  trace: EvalTrace;
};

export function TraceViewer({ trace }: TraceViewerProps) {
  const [inputOpen, setInputOpen] = useState(false);
  const { hook, body, close } = parseScript(trace.script);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{trace.title}</CardTitle>
            {trace.sourceRef && (
              <Badge variant="secondary" className="shrink-0">
                {trace.sourceRef}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Collapsible open={inputOpen} onOpenChange={setInputOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                Input (raw content)
                {inputOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {trace.rawContent}
              </p>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Script</h3>
            <div className="space-y-2">
              <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/30 dark:border-amber-600">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  Hook
                </h4>
                <p className="text-sm whitespace-pre-wrap">
                  {hook || "(no hook found)"}
                </p>
              </div>
              <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-950/30 dark:border-emerald-600">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Body
                </h4>
                <p className="text-sm whitespace-pre-wrap">
                  {body || "(no body found)"}
                </p>
              </div>
              <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-950/30 dark:border-blue-600">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-800 dark:text-blue-200">
                  Close
                </h4>
                <p className="text-sm whitespace-pre-wrap">
                  {close || "(no close found)"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
