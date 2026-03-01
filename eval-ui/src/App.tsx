import { useState, useEffect, useCallback, useRef } from "react";
import type { EvalTrace, Annotation, Judgment, Dimension } from "./types";
import { DIMENSIONS } from "./types";
import type { AnnotationSource } from "./api/annotations";
import { TraceViewer } from "./components/TraceViewer";
import { JudgmentForm } from "./components/JudgmentForm";
import { JudgeComparison } from "./components/JudgeComparison";
import { BatchList } from "./components/BatchList";
import { loadEvalDataset, deleteTrace } from "./api/loadTraces";
import { loadMergedAnnotations, saveAnnotations } from "./api/annotations";
import { loadJudgeResults, judgeResultKey } from "./api/loadJudgeResults";
import {
  loadGoldenSet,
  addToGoldenSet,
  removeFromGoldenSet,
  type GoldenSetEntry,
} from "./api/goldenSet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function annotationKey(traceId: string, model: string): string {
  return model ? `${traceId}::${model}` : `${traceId}::default`;
}

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
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [judgeResults, setJudgeResults] = useState<Awaited<ReturnType<typeof loadJudgeResults>>>(null);
  const [goldenSet, setGoldenSet] = useState<GoldenSetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<Error | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      loadEvalDataset(),
      loadMergedAnnotations(),
      loadJudgeResults(),
      loadGoldenSet(),
    ])
      .then(([t, { annotations: a, sources: s }, jr, gs]) => {
        setTraces(t);
        setAnnotations(a);
        setSources(s);
        setJudgeResults(jr);
        setGoldenSet(gs);
        if (t.length > 0 && !selectedId) {
          const unreviewed = t.find((tr) => {
            const models = Object.keys(tr.script);
            return !models.some((m) => s[annotationKey(tr.id, m)] === "human");
          });
          setSelectedId(unreviewed ? unreviewed.id : t[0].id);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const selectedTrace = traces.find((t) => t.id === selectedId);
  const models = selectedTrace ? Object.keys(selectedTrace.script) : [];
  const effectiveModel = selectedModel || models[0] || "";
  const annKey = selectedId && effectiveModel ? annotationKey(selectedId, effectiveModel) : "";
  const selectedAnnotation = annKey ? annotations[annKey] : undefined;
  const selectedSource = annKey ? sources[annKey] : undefined;

  useEffect(() => {
    if (selectedTrace && models.length > 0 && !models.includes(selectedModel)) {
      setSelectedModel(models[0]);
    }
  }, [selectedTrace, selectedModel, models]);

  const hasBadImageWithoutNote = Boolean(
    selectedAnnotation?.imageAnnotations?.some(
      (a) =>
        a.marker === "bad" &&
        !(a.commonIssue && a.commonIssue !== "Other") &&
        !(a.note && a.note.trim())
    )
  );

  const performSave = useCallback(async () => {
    const humanOnly = Object.fromEntries(
      Object.entries(annotations).filter(([k]) => sources[k] === "human")
    );
    if (Object.keys(humanOnly).length === 0) return;
    setSaving(true);
    setLastSaveError(null);
    try {
      await saveAnnotations(humanOnly);
    } catch (err) {
      setLastSaveError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }, [annotations, sources]);

  useEffect(() => {
    const hasHuman = Object.values(sources).some((s) => s === "human");
    if (!hasHuman || hasBadImageWithoutNote) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
      saveTimeoutRef.current = null;
    }, 600);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [annotations, sources, performSave, hasBadImageWithoutNote]);

  const handleJudgmentChange = useCallback(
    (judgments: Record<string, Judgment | undefined>, notes: string) => {
      if (!selectedId || !effectiveModel) return;
      const list = DIMENSIONS.map((d) => judgments[d]).filter(
        (j): j is Judgment => j !== undefined
      );
      const key = annotationKey(selectedId, effectiveModel);
      setAnnotations((prev) => {
        const current = prev[key];
        return {
          ...prev,
          [key]: {
            traceId: selectedId,
            model: effectiveModel,
            judgments: list,
            notes: notes || undefined,
            imageAnnotations: current?.imageAnnotations,
            reviewedAt: new Date().toISOString(),
          },
        };
      });
      setSources((prev) => ({ ...prev, [key]: "human" as AnnotationSource }));
    },
    [selectedId, effectiveModel]
  );

  const handleImageAnnotationChange = useCallback(
    (
      sceneIndex: number,
      marker: "good" | "bad" | null,
      note?: string,
      commonIssue?: string
    ) => {
      if (!selectedId || !effectiveModel) return;
      const key = annotationKey(selectedId, effectiveModel);
      setSources((prev) => ({ ...prev, [key]: "human" as AnnotationSource }));
      setAnnotations((prev) => {
        const current = prev[key];
        const existing = current?.imageAnnotations ?? [];
        const filtered = existing.filter((a) => a.sceneIndex !== sceneIndex);
        const updated: Annotation["imageAnnotations"] =
          marker === null
            ? (filtered.length > 0 ? filtered : undefined)
            : marker === "good"
              ? [...filtered, { sceneIndex, marker }]
              : [
                  ...filtered,
                  {
                    sceneIndex,
                    marker,
                    note: note ?? "",
                    commonIssue: commonIssue && commonIssue !== "Other" ? commonIssue : undefined,
                  },
                ];
        return {
          ...prev,
          [key]: {
            ...current,
            traceId: selectedId,
            model: effectiveModel,
            judgments: current?.judgments ?? [],
            notes: current?.notes,
            imageAnnotations: updated,
            reviewedAt: new Date().toISOString(),
          },
        };
      });
    },
    [selectedId, effectiveModel]
  );

  const saveStatusText =
    saving
      ? "Saving..."
      : lastSaveError
        ? "Save failed"
        : hasBadImageWithoutNote
          ? "Complete notes for bad images to save"
          : "Saved";

  const handleExport = useCallback(() => {
    const humanOnly = Object.fromEntries(
      Object.entries(annotations).filter(([k]) => sources[k] === "human")
    );
    const list = Object.values(humanOnly).map((a) => ({
      ...a,
      imageAnnotations: a.imageAnnotations?.map((img) => {
        if (img.marker !== "bad") return img;
        const fullNote =
          img.commonIssue && img.commonIssue !== "Other"
            ? img.note
              ? `${img.commonIssue}: ${img.note}`
              : img.commonIssue
            : img.note ?? "";
        return { ...img, note: fullNote, commonIssue: undefined };
      }),
    }));
    const blob = new Blob([JSON.stringify(list, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "annotations.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [annotations, sources]);

  const traceReviewed = useCallback(
    (trace: EvalTrace) => {
      return Object.keys(trace.script).some(
        (m) => sources[annotationKey(trace.id, m)] === "human"
      );
    },
    [sources]
  );

  const traceInGoldenSet = useCallback(
    (trace: EvalTrace) => {
      return goldenSet.some((e) => (e.traceId ?? "") === trace.id);
    },
    [goldenSet]
  );

  const traceHasDisagreement = useCallback(
    (trace: EvalTrace) => {
      if (!judgeResults?.entries) return false;
      return Object.keys(trace.script).some((model) => {
        const key = judgeResultKey(trace.id, model);
        const entry = judgeResults.entries.find(
          (e) => judgeResultKey(e.traceId, e.model ?? "") === key
        );
        return entry && entry.disagreements.length > 0;
      });
    },
    [judgeResults]
  );

  const selectedJudgeResult =
    selectedId &&
    effectiveModel &&
    judgeResults?.entries?.find(
      (e) => judgeResultKey(e.traceId, e.model ?? "") === annotationKey(selectedId, effectiveModel)
    );

  const isInGoldenSet =
    selectedId &&
    effectiveModel &&
    goldenSet.some(
      (e) => (e.traceId ?? "") === selectedId && (e.model ?? "") === effectiveModel
    );

  const canAddToGoldenSet =
    selectedSource === "human" &&
    selectedAnnotation?.judgments &&
    DIMENSIONS.every((d) =>
      selectedAnnotation!.judgments!.some(
        (j) => j.dimension === d && j.pass !== undefined
      )
    );

  const buildGoldenEntry = useCallback((): GoldenSetEntry | null => {
    if (!selectedTrace || !effectiveModel || !selectedAnnotation?.judgments) return null;
    const judgmentsByDim = Object.fromEntries(
      selectedAnnotation.judgments.map((j) => [j.dimension, j.pass])
    );
    const expected: Record<string, boolean> = {};
    for (const d of DIMENSIONS) {
      const v = judgmentsByDim[d];
      if (v !== undefined) expected[d] = v;
    }
    if (Object.keys(expected).length < DIMENSIONS.length) return null;
    const scriptText = selectedTrace.script[effectiveModel] ?? "";
    return {
      traceId: selectedTrace.id,
      model: effectiveModel || null,
      title: selectedTrace.title,
      rawContent: selectedTrace.rawContent,
      script: scriptText,
      expected,
    };
  }, [selectedTrace, effectiveModel, selectedAnnotation]);

  const handleStarToggle = useCallback(async () => {
    if (!selectedId || !effectiveModel) return;
    try {
      if (isInGoldenSet) {
        await removeFromGoldenSet(selectedId, effectiveModel);
        setGoldenSet((prev) =>
          prev.filter(
            (e) => (e.traceId ?? "") !== selectedId || (e.model ?? "") !== effectiveModel
          )
        );
      } else {
        const entry = buildGoldenEntry();
        if (!entry) return;
        await addToGoldenSet(entry);
        setGoldenSet((prev) => [...prev, entry]);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update golden set");
    }
  }, [selectedId, effectiveModel, isInGoldenSet, buildGoldenEntry]);

  const handleDeleteTrace = useCallback(
    async (trace: EvalTrace) => {
      if (!confirm(`Delete "${trace.title}" from the eval dataset?`)) return;
      try {
        await deleteTrace(trace.id);
        setTraces((prev) => prev.filter((t) => t.id !== trace.id));
        setAnnotations((prev) => {
          const next = { ...prev };
          for (const m of Object.keys(trace.script)) {
            delete next[annotationKey(trace.id, m)];
          }
          return next;
        });
        setSources((prev) => {
          const next = { ...prev };
          for (const m of Object.keys(trace.script)) {
            delete next[annotationKey(trace.id, m)];
          }
          return next;
        });
        // Remove from golden set (one entry per model)
        const toRemove = goldenSet.filter((e) => (e.traceId ?? "") === trace.id);
        for (const e of toRemove) {
          try {
            await removeFromGoldenSet(trace.id, e.model ?? "");
          } catch {
            // Ignore; trace is gone
          }
        }
        setGoldenSet((prev) => prev.filter((e) => (e.traceId ?? "") !== trace.id));
        if (selectedId === trace.id) {
          const remaining = traces.filter((t) => t.id !== trace.id);
          setSelectedId(remaining[0]?.id ?? null);
          setSelectedModel("");
        }
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Failed to delete trace");
      }
    },
    [selectedId, traces, goldenSet]
  );

  if (loading) return <div className="flex min-h-svh items-center justify-center">Loading...</div>;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Script Eval</h1>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm ${
              saving ? "text-muted-foreground" : lastSaveError ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {saveStatusText}
          </span>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export annotations
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 border-r bg-muted/30">
          <BatchList
            traces={traces}
            traceReviewed={traceReviewed}
            traceHasDisagreement={traceHasDisagreement}
            traceInGoldenSet={traceInGoldenSet}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {selectedTrace ? (
                <TraceViewer
                  trace={selectedTrace}
                  selectedModel={effectiveModel}
                  onModelChange={setSelectedModel}
                  imageAnnotations={selectedAnnotation?.imageAnnotations}
                  onImageAnnotationChange={handleImageAnnotationChange}
                  onDelete={handleDeleteTrace}
                  evaluationsSlot={
                    <div className="space-y-4">
                      <JudgmentForm
                        judgments={judgmentsFromAnnotation(selectedAnnotation)}
                        notes={selectedAnnotation?.notes ?? ""}
                        source={selectedSource}
                        onChange={handleJudgmentChange}
                        isStarred={!!isInGoldenSet}
                        onStarToggle={handleStarToggle}
                        canStar={!!canAddToGoldenSet}
                      />
                      {selectedJudgeResult && selectedAnnotation?.judgments && (
                        <JudgeComparison
                          judgeResult={selectedJudgeResult}
                          humanJudgments={
                            Object.fromEntries(
                              DIMENSIONS.map((dim) => {
                                const j = selectedAnnotation!.judgments!.find((x) => x.dimension === dim);
                                return [dim, j ? { pass: j.pass, critique: j.critique } : undefined];
                              })
                            ) as Record<Dimension, { pass: boolean; critique: string } | undefined>
                          }
                        />
                      )}
                    </div>
                  }
                />
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
