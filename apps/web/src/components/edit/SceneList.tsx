"use client";

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
  /** Assets phase: lock script, imagery editable, show regenerate. */
  scriptLocked?: boolean;
  imageryEditable?: boolean;
  onRegenerate?: (sceneIndex: number, imagery?: string, feedback?: string) => void;
  regeneratingSceneIndex?: number | null;
}

export function SceneList({
  scenes,
  feedbackByScene,
  onFeedbackChange,
  scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  regeneratingSceneIndex = null,
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
          onFeedbackChange={onFeedbackChange}
          scriptLocked={scriptLocked}
          imageryEditable={imageryEditable}
          onRegenerate={onRegenerate}
          isRegenerating={regeneratingSceneIndex === i}
        />
      ))}
    </div>
  );
}
