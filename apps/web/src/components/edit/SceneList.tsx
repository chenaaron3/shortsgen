"use client";

import { sceneSchema } from "@shortgen/types";
import type { z } from "zod";
import { SceneRow } from "./SceneRow";

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneListProps {
  scenes: Scene[];
  feedbackByScene: Record<number, string>;
  onFeedbackChange: (sceneIndex: number, liked: boolean | null, feedback: string) => void;
  /** Suggested scenes from feedback streaming. Rendered as overlay per scene. */
  suggestionScenes?: z.infer<typeof sceneSchema>[] | undefined;
  /** Per-scene per-field accept/decline. When declined, suggestion is hidden. */
  suggestionDecisions?: Record<number, { text?: "accept" | "decline"; imagery?: "accept" | "decline" }>;
  /** Called when user accepts or declines a suggestion. */
  onSuggestionDecision?: (
    sceneIndex: number,
    field: "text" | "imagery",
    decision: "accept" | "decline",
  ) => void;
  /** Assets phase: lock script, imagery editable, show regenerate. */
  scriptLocked?: boolean;
  imageryEditable?: boolean;
  onRegenerate?: (sceneIndex: number, imagery?: string, feedback?: string) => void;
  sceneUpdating?: number | null;
}

export function SceneList({
  scenes,
  feedbackByScene,
  onFeedbackChange,
  suggestionScenes,
  suggestionDecisions,
  onSuggestionDecision,
  scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  sceneUpdating = null,
}: SceneListProps) {
  if (scenes.length === 0) {
    return (
      <p className="text-muted-foreground">No scenes yet. Processing…</p>
    );
  }

  return (
    <div className="space-y-4">
      {scenes.map((scene, i) => (
        <SceneRow
          key={i}
          scene={scene}
          sceneIndex={i}
          feedback={feedbackByScene[i]}
          suggestion={suggestionScenes?.[i]}
          suggestionDecisions={suggestionDecisions?.[i]}
          onSuggestionDecision={onSuggestionDecision}
          onFeedbackChange={onFeedbackChange}
          scriptLocked={scriptLocked}
          imageryEditable={imageryEditable}
          onRegenerate={onRegenerate}
          isRegenerating={sceneUpdating === i}
        />
      ))}
    </div>
  );
}
