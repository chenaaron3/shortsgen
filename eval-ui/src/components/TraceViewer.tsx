import { ChevronDown, ChevronRight, Film, List, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { parseScript } from '../lib/parseScript';
import { COMMON_IMAGE_ISSUES } from '../types';

import type { EvalTrace, ImageAnnotation } from "../types";
type ChunkScene = {
  text: string;
  imagery: string;
  section: string;
  transition_from_previous?: boolean;
};

type ChunksData = {
  scenes: ChunkScene[];
  title?: string;
  description?: string;
};

type TraceViewerProps = {
  trace: EvalTrace;
  selectedModel: string;
  onModelChange: (model: string) => void;
  imageAnnotations?: ImageAnnotation[];
  onImageAnnotationChange?: (
    sceneIndex: number,
    marker: "good" | "bad" | null,
    note?: string,
    commonIssue?: string
  ) => void;
};

function assetBase(traceId: string, assetHash: string): string {
  return `/eval-assets/${traceId}/${assetHash}`;
}

function getImageAnnotation(imageAnnotations: ImageAnnotation[] | undefined, sceneIndex: number): ImageAnnotation | undefined {
  return imageAnnotations?.find((a) => a.sceneIndex === sceneIndex);
}

export function TraceViewer({ trace, selectedModel, onModelChange, imageAnnotations, onImageAnnotationChange }: TraceViewerProps) {
  const [inputOpen, setInputOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [chunks, setChunks] = useState<ChunksData | null>(null);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [imagePopup, setImagePopup] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePopup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImagePopup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagePopup]);

  const models = Object.keys(trace.script);
  const scriptText = selectedModel ? trace.script[selectedModel] ?? "" : "";
  const { hook, body, close } = parseScript(scriptText);

  const assetHash = selectedModel && trace.assets?.[selectedModel];

  useEffect(() => {
    if (!assetHash || !trace.id) {
      setChunks(null);
      setChunksError(null);
      return;
    }
    setChunks(null);
    setChunksError(null);
    fetch(`${assetBase(trace.id, assetHash)}/chunks.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => setChunks(data as ChunksData))
      .catch((err) => setChunksError(err instanceof Error ? err.message : String(err)));
  }, [trace.id, assetHash]);

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
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Script</h3>
              {models.length > 1 ? (
                <Tabs
                  value={selectedModel || models[0]}
                  onValueChange={(v) => onModelChange(v)}
                >
                  <TabsList className="h-8">
                    {models.map((m) => (
                      <TabsTrigger key={m} value={m} className="text-xs">
                        {m}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              ) : (
                models[0] && (
                  <Badge variant="outline" className="text-xs">
                    {models[0]}
                  </Badge>
                )
              )}
            </div>
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

          {assetHash && (
            <Collapsible open={assetsOpen} onOpenChange={setAssetsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <Film className="size-4" />
                    Chunks, Images & Video
                  </span>
                  {assetsOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3">
                  {chunksError && (
                    <p className="text-sm text-destructive">Failed to load chunks: {chunksError}</p>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 lg:items-stretch min-h-[480px]">
                    {/* Left: scenes with paired images - same height as video column */}
                    <div className="space-y-2 min-h-0 flex flex-col">
                      {chunks && chunks.scenes && chunks.scenes.length > 0 && (
                        <>
                          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide shrink-0">
                            <List className="size-3.5" />
                            Scenes ({chunks.scenes.length})
                          </h4>
                          <div className="space-y-3 min-h-0 flex-1 overflow-y-auto pr-2">
                            {chunks.scenes.map((scene, i) => {
                              const imgAnn = getImageAnnotation(imageAnnotations, i);
                              return (
                                <div
                                  key={i}
                                  className={`flex gap-3 rounded-md border p-3 text-sm ${imgAnn?.marker === "bad" ? "border-destructive/50 bg-destructive/5" : "bg-muted/30"}`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        {scene.section}
                                      </Badge>
                                      {scene.transition_from_previous && (
                                        <Badge variant="secondary" className="text-[10px]">
                                          transition
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="mt-1 font-medium">{scene.text}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {scene.imagery}
                                    </p>
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setImagePopup(
                                          `${assetBase(trace.id, assetHash)}/images/image_${i + 1}.png`
                                        )
                                      }
                                      className="overflow-hidden rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                                    >
                                      <img
                                        src={`${assetBase(trace.id, assetHash)}/images/image_${i + 1}.png`}
                                        alt={`Scene ${i + 1}`}
                                        className="h-24 w-auto object-cover"
                                      />
                                    </button>
                                    {onImageAnnotationChange && (
                                      <div className="flex flex-col gap-1.5 w-full min-w-[120px]">
                                        <div className="flex gap-1">
                                          <Button
                                            type="button"
                                            variant={imgAnn?.marker === "good" ? "default" : "outline"}
                                            size="sm"
                                            className="flex-1 h-7 text-xs"
                                            onClick={() => onImageAnnotationChange(i, imgAnn?.marker === "good" ? null : "good")}
                                          >
                                            <ThumbsUp className="mr-0.5 size-3" />
                                            Good
                                          </Button>
                                          <Button
                                            type="button"
                                            variant={imgAnn?.marker === "bad" ? "destructive" : "outline"}
                                            size="sm"
                                            className="flex-1 h-7 text-xs"
                                            onClick={() =>
                                              onImageAnnotationChange(
                                                i,
                                                imgAnn?.marker === "bad" ? null : "bad",
                                                imgAnn?.note ?? "",
                                                imgAnn?.commonIssue
                                              )
                                            }
                                          >
                                            <ThumbsDown className="mr-0.5 size-3" />
                                            Bad
                                          </Button>
                                        </div>
                                        {imgAnn?.marker === "bad" && (
                                          <>
                                            <select
                                              value={imgAnn.commonIssue ?? ""}
                                              onChange={(e) =>
                                                onImageAnnotationChange(
                                                  i,
                                                  "bad",
                                                  imgAnn?.note ?? "",
                                                  e.target.value
                                                )
                                              }
                                              className="h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                            >
                                              <option value="">Select issue...</option>
                                              {COMMON_IMAGE_ISSUES.map((issue) => (
                                                <option key={issue} value={issue}>
                                                  {issue}
                                                </option>
                                              ))}
                                            </select>
                                            <Textarea
                                              placeholder="Additional note (optional)"
                                              value={imgAnn.note ?? ""}
                                              onChange={(e) =>
                                                onImageAnnotationChange(
                                                  i,
                                                  "bad",
                                                  e.target.value,
                                                  imgAnn?.commonIssue ?? ""
                                                )
                                              }
                                              rows={1}
                                              className="min-h-0 h-7 text-xs resize-none py-1.5"
                                            />
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right: video - column height drives row, scenes match */}
                    {assetHash && (
                      <div className="space-y-2 flex flex-col min-h-0">
                        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide shrink-0">
                          <Film className="size-3.5" />
                          Video
                        </h4>
                        <video
                          src={`${assetBase(trace.id, assetHash)}/short.mp4`}
                          controls
                          className="w-full max-w-[360px] rounded-lg border"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {imagePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setImagePopup(null)}
        >
          <button
            type="button"
            onClick={() => setImagePopup(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          <img
            src={imagePopup}
            alt="Scene preview"
            className="max-h-[90vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
