import { useState, useEffect, useCallback } from "react";
import type { EvalTrace, Annotation, Judgment } from "./types";
import { DIMENSIONS } from "./types";
import type { AnnotationSource } from "./api/annotations";
import { TraceViewer } from "./components/TraceViewer";
import { JudgmentForm } from "./components/JudgmentForm";
import { BatchList } from "./components/BatchList";
import { loadEvalDataset } from "./api/loadTraces";
import { loadMergedAnnotations, saveAnnotations } from "./api/annotations";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function judgmentsFromAnnotation(a: Annotation | undefined): Record<string, Judgment | undefined> {
  const out: Record<string, Judgment | undefined> = {};
  for (const d of DIMENSIONS) {
    out[d] = a?.judgments?.find((j) => j.dimension === d);
  }
  return out;
}

function App() {
  const [traces, setTraces] = useState<EvalTrace[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({});
  const [sources, setSources] = useState<Record<string, AnnotationSource>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "reviewed" | "unreviewed">("unreviewed");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([loadEvalDataset(), loadMergedAnnotations()])
      .then(([t, { annotations: a, sources: s }]) => {
        setTraces(t);
        setAnnotations(a);
        setSources(s);
        if (t.length > 0 && !selectedId) {
          const unreviewed = t.find((x) => s[x.id] !== "human");
          setSelectedId(unreviewed ? unreviewed.id : t[0].id);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const selectedTrace = traces.find((t) => t.id === selectedId);
  const selectedAnnotation = selectedId ? annotations[selectedId] : undefined;
  const selectedSource = selectedId ? sources[selectedId] : undefined;

  const handleSave = useCallback(
    (judgments: Record<string, Judgment | undefined>, notes: string) => {
      if (!selectedId) return;
      const list = DIMENSIONS.map((d) => judgments[d]).filter(
        (j): j is Judgment => j !== undefined
      );
      const next: Annotation = {
        traceId: selectedId,
        judgments: list,
        notes: notes || undefined,
        reviewedAt: new Date().toISOString(),
      };
      const updatedAnnotations = { ...annotations, [selectedId]: next };
      const updatedSources = { ...sources, [selectedId]: "human" as AnnotationSource };
      setAnnotations(updatedAnnotations);
      setSources(updatedSources);
      setSaving(true);
      const humanOnly = Object.fromEntries(
        Object.entries(updatedAnnotations).filter(([id]) => updatedSources[id] === "human")
      );
      saveAnnotations(humanOnly)
        .then(() => setSaving(false))
        .catch((err) => {
          console.error(err);
          setSaving(false);
        });
    },
    [selectedId, annotations, sources]
  );

  const handleJudgmentChange = useCallback(
    (judgments: Record<string, Judgment | undefined>, notes: string) => {
      if (!selectedId) return;
      const list = DIMENSIONS.map((d) => judgments[d]).filter(
        (j): j is Judgment => j !== undefined
      );
      const next: Annotation = {
        traceId: selectedId,
        judgments: list,
        notes: notes || undefined,
        reviewedAt: new Date().toISOString(),
      };
      setAnnotations((prev) => ({ ...prev, [selectedId]: next }));
    },
    [selectedId]
  );

  const handleExport = useCallback(() => {
    const humanOnly = Object.fromEntries(
      Object.entries(annotations).filter(([id]) => sources[id] === "human")
    );
    const list = Object.values(humanOnly);
    const blob = new Blob([JSON.stringify(list, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "annotations.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [annotations, sources]);

  if (loading) return <div className="flex min-h-svh items-center justify-center">Loading...</div>;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Script Eval</h1>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Export annotations
        </Button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 border-r bg-muted/30">
          <BatchList
            traces={traces}
            sources={sources}
            selectedId={selectedId}
            filter={filter}
            onSelect={setSelectedId}
            onFilterChange={setFilter}
          />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {selectedTrace ? (
                <>
                  <TraceViewer trace={selectedTrace} />
                  <Separator />
                  <JudgmentForm
                    judgments={judgmentsFromAnnotation(selectedAnnotation)}
                    notes={selectedAnnotation?.notes ?? ""}
                    source={selectedSource}
                    onChange={handleJudgmentChange}
                    onSave={handleSave}
                    saving={saving}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">Select a trace to evaluate.</p>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

export default App;
