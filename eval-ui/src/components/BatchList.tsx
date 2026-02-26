import type { EvalTrace } from "../types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

type BatchListProps = {
  traces: EvalTrace[];
  traceReviewed: (trace: EvalTrace) => boolean;
  traceHasLLM?: (trace: EvalTrace) => boolean;
  selectedId: string | null;
  filter: "all" | "reviewed" | "unreviewed";
  onSelect: (id: string) => void;
  onFilterChange: (f: "all" | "reviewed" | "unreviewed") => void;
};

export function BatchList({
  traces,
  traceReviewed,
  traceHasLLM = () => false,
  selectedId,
  filter,
  onSelect,
  onFilterChange,
}: BatchListProps) {
  const filtered =
    filter === "all"
      ? traces
      : filter === "reviewed"
        ? traces.filter((t) => traceReviewed(t))
        : traces.filter((t) => !traceReviewed(t));

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 p-3">
        <h3 className="text-sm font-semibold">Traces ({filtered.length})</h3>
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as typeof filter)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unreviewed">Unreviewed</TabsTrigger>
            <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {filtered.map((trace) => {
            const reviewed = traceReviewed(trace);
            const fromLLM = traceHasLLM(trace);
            return (
              <Button
                key={trace.id}
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-2 px-3 py-2 text-left",
                  selectedId === trace.id && "bg-accent",
                  reviewed && "border-l-2 border-l-emerald-500"
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
                {reviewed ? (
                  <Badge variant="secondary" className="shrink-0">
                    <Check className="size-3" />
                  </Badge>
                ) : fromLLM ? (
                  <Badge variant="outline" className="shrink-0 text-muted-foreground">
                    <Sparkles className="size-3" />
                  </Badge>
                ) : null}
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
