import { useState, useEffect, useCallback, useRef } from "react";
import type { EvalTrace, Annotation, Judgment, Dimension, JudgeDatasetStats, JudgeResultEntry } from "./types";
import { DIMENSIONS } from "./types";
import type { AnnotationSource } from "./api/annotations";
import { TraceViewer } from "./components/TraceViewer";
import { JudgmentForm } from "./components/JudgmentForm";
import { JudgeComparison } from "./components/JudgeComparison";
import { BatchList, type DatasetFilter } from "./components/BatchList";
import { loadEvalDataset, deleteTrace } from "./api/loadTraces";
import { loadMergedAnnotations, saveAnnotations } from "./api/annotations";
import { loadJudgeResults, judgeResultKey } from "./api/loadJudgeResults";
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
  const [datasetFilter, setDatasetFilter] = useState<DatasetFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<Error | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      loadEvalDataset(),
      loadMergedAnnotations(),
      loadJudgeResults(),
    ])
      .then(([t, { annotations: a, sources: s }, jr]) => {
        setTraces(t);
        setAnnotations(a);
        setSources(s);
        setJudgeResults(jr);
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
            is_golden: current?.is_golden,
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
            is_golden: current?.is_golden,
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
      return Object.keys(trace.script).some(
        (m) => annotations[annotationKey(trace.id, m)]?.is_golden
      );
    },
    [annotations]
  );

  const filteredTraces = traces.filter((trace) => {
    const inGolden = traceInGoldenSet(trace);
    if (datasetFilter === "all") return true;
    if (datasetFilter === "golden") return inGolden;
    return !inGolden; // holdout
  });

  useEffect(() => {
    if (selectedId && !filteredTraces.some((t) => t.id === selectedId)) {
      setSelectedId(filteredTraces[0]?.id ?? null);
    }
  }, [datasetFilter, filteredTraces, selectedId]);

  const getJudgeEntry = useCallback(
    (trace: EvalTrace): JudgeResultEntry | undefined => {
      if (!judgeResults?.entries) return undefined;
      const models = Object.keys(trace.script);
      const model = models.includes("default") ? "default" : models[0];
      if (!model) return undefined;
      const key = judgeResultKey(trace.id, model);
      return judgeResults.entries.find(
        (e) => judgeResultKey(e.traceId, e.model ?? "") === key
      );
    },
    [judgeResults]
  );

  /** Human labels (annotations) when source is human. Used as ground truth for mismatch. */
  const getHumanLabelData = useCallback(
    (trace: EvalTrace): Record<Dimension, boolean> | undefined => {
      const models = Object.keys(trace.script);
      const model = models.includes("default") ? "default" : models[0];
      if (!model) return undefined;
      const key = annotationKey(trace.id, model);
      if (sources[key] !== "human") return undefined;
      const ann = annotations[key];
      if (!ann?.judgments?.length) return undefined;
      const byDim = Object.fromEntries(
        ann.judgments.map((j) => [j.dimension, j.pass])
      ) as Partial<Record<Dimension, boolean>>;
      if (!DIMENSIONS.every((d) => byDim[d] !== undefined)) return undefined;
      return byDim as Record<Dimension, boolean>;
    },
    [annotations, sources]
  );

  /** Best available labels for display: human > judge > annotations (any source). */
  const getLabelData = useCallback(
    (trace: EvalTrace): Record<Dimension, boolean> | undefined => {
      const human = getHumanLabelData(trace);
      if (human) return human;
      const judge = getJudgeEntry(trace)?.predicted;
      if (judge) return judge;
      const models = Object.keys(trace.script);
      const model = models.includes("default") ? "default" : models[0];
      if (!model) return undefined;
      const key = annotationKey(trace.id, model);
      const ann = annotations[key];
      if (!ann?.judgments?.length) return undefined;
      const byDim = Object.fromEntries(
        ann.judgments.map((j) => [j.dimension, j.pass])
      ) as Partial<Record<Dimension, boolean>>;
      if (!DIMENSIONS.every((d) => byDim[d] !== undefined)) return undefined;
      return byDim as Record<Dimension, boolean>;
    },
    [getHumanLabelData, getJudgeEntry, annotations]
  );

  /** Dimensions where judge predicted differs from expected (human or holdout). */
  const getDisagreedDimensions = useCallback(
    (trace: EvalTrace): Dimension[] => {
      const humanLabels = getHumanLabelData(trace);
      const judgeEntry = getJudgeEntry(trace);
      if (!judgeEntry) return [];
      const groundTruth = humanLabels ?? judgeEntry.expected;
      return DIMENSIONS.filter((d) => groundTruth[d] !== judgeEntry.predicted[d]);
    },
    [getHumanLabelData, getJudgeEntry]
  );

  const traceHasDisagreement = useCallback(
    (trace: EvalTrace) => getDisagreedDimensions(trace).length > 0,
    [getDisagreedDimensions]
  );

  const selectedJudgeResult =
    selectedId &&
    effectiveModel &&
    judgeResults?.entries?.find(
      (e) => judgeResultKey(e.traceId, e.model ?? "") === annotationKey(selectedId, effectiveModel)
    );

  const isInGoldenSet =
    selectedId && effectiveModel && !!(annotations[annKey]?.is_golden);

  const canAddToGoldenSet =
    selectedSource === "human" &&
    selectedAnnotation?.judgments &&
    DIMENSIONS.every((d) =>
      selectedAnnotation!.judgments!.some(
        (j) => j.dimension === d && j.pass !== undefined
      )
    );

  const handleStarToggle = useCallback(async () => {
    if (!selectedId || !effectiveModel || !annKey) return;
    const nextGolden = !annotations[annKey]?.is_golden;
    setAnnotations((prev) => {
      const current = prev[annKey];
      if (!current) return prev;
      return {
        ...prev,
        [annKey]: { ...current, is_golden: nextGolden },
      };
    });
    setSources((prev) => ({ ...prev, [annKey]: "human" as AnnotationSource }));
    // Save is triggered by the annotations/sources useEffect; no explicit API call needed.
  }, [selectedId, effectiveModel, annKey, annotations]);

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
        // Annotations (and is_golden) are already removed when we delete annotation entries above
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
    [selectedId, traces]
  );

  const formatStats = (stats: JudgeDatasetStats | undefined) => {
    if (!stats) return null;
    return DIMENSIONS.filter((d) => stats[d])
      .map(
        (d) => `${d}: ${Math.round((100 * stats[d].agree) / (stats[d].agree + stats[d].disagree || 1))}%`
      )
      .join(", ");
  };

  const { lenientCount, strictCount } = (() => {
    if (!judgeResults?.entries?.length) return { lenientCount: 0, strictCount: 0 };
    let lenient = 0;
    let strict = 0;
    for (const e of judgeResults.entries) {
      for (const d of DIMENSIONS) {
        if (e.expected[d] !== e.predicted[d]) {
          if (e.expected[d] && !e.predicted[d]) strict++;
          else lenient++;
        }
      }
    }
    return { lenientCount: lenient, strictCount: strict };
  })();

  const judgeSummary =
    judgeResults?.golden && judgeResults?.holdout
      ? `Golden (${formatStats(judgeResults.golden)}) | Holdout (${formatStats(judgeResults.holdout)})`
      : null;
  const agreementNote =
    lenientCount > 0 || strictCount > 0
      ? `↗ ${lenientCount} lenient | ↘ ${strictCount} strict`
      : null;

  if (loading) return <div className="flex min-h-svh items-center justify-center">Loading...</div>;

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <h1 className="text-lg font-semibold">Script Eval</h1>
          {judgeSummary && (
            <span className="text-xs text-muted-foreground font-mono truncate">{judgeSummary}</span>
          )}
          {agreementNote && (
            <span className="text-[10px] text-amber-600 dark:text-amber-500" title="Lenient = judge passed when expected fail. Strict = judge failed when expected pass.">
              {agreementNote}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
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
            traces={filteredTraces}
            traceReviewed={traceReviewed}
            traceHasDisagreement={traceHasDisagreement}
            traceInGoldenSet={traceInGoldenSet}
            getLabelData={getLabelData}
            getDisagreedDimensions={getDisagreedDimensions}
            getJudgeEntry={getJudgeEntry}
            selectedId={selectedId}
            onSelect={setSelectedId}
            datasetFilter={datasetFilter}
            onDatasetFilterChange={setDatasetFilter}
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
