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
}

export function SceneList({
  scenes,
  feedbackByScene,
  onFeedbackChange,
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
        />
      ))}
    </div>
  );
}
