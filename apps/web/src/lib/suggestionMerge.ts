import type { ChunksOutput } from "@shortgen/types";

/** True if any scene has a suggestion that differs from current DB chunks (missing suggestion for a scene = not actionable). */
export function hasActionableSceneSuggestions(
  current: ChunksOutput,
  sceneSuggestions: ChunksOutput | null | undefined,
): boolean {
  if (!sceneSuggestions?.scenes?.length) return false;
  if (!current.scenes?.length) return false;
  for (let i = 0; i < sceneSuggestions.scenes.length; i++) {
    const sug = sceneSuggestions.scenes[i];
    if (!sug) continue;
    const cur = current.scenes[i];
    if (!cur) continue;
    if (sug.text !== cur.text || sug.imagery !== cur.imagery) return true;
  }
  return false;
}

/** Update text and/or imagery for one scene; preserves all other fields and scenes. */
export function replaceSceneFields(
  current: ChunksOutput,
  sceneIndex: number,
  fields: { text?: string; imagery?: string },
): ChunksOutput {
  const mergedScenes = current.scenes.map((s, i) => {
    if (i !== sceneIndex) return s;
    return {
      ...s,
      ...(fields.text !== undefined ? { text: fields.text } : {}),
      ...(fields.imagery !== undefined ? { imagery: fields.imagery } : {}),
    };
  });
  return { ...current, scenes: mergedScenes };
}

/** Overlay all suggested text + imagery onto current scenes (by index). Preserve top-level fields from the suggestion payload. */
export function mergeAllSceneSuggestions(
  current: ChunksOutput,
  sceneSuggestions: ChunksOutput,
): ChunksOutput {
  const mergedScenes = current.scenes.map((scene, i) => {
    const sug = sceneSuggestions.scenes[i];
    if (!sug) return scene;
    return { ...scene, text: sug.text, imagery: sug.imagery };
  });
  return { ...sceneSuggestions, scenes: mergedScenes };
}

/** Merge both text and imagery from the suggestion for a single scene. */
export function mergeSceneSuggestionsForOneScene(
  current: ChunksOutput,
  sceneSuggestions: ChunksOutput,
  sceneIndex: number,
): ChunksOutput {
  const sug = sceneSuggestions.scenes[sceneIndex];
  if (!sug) return current;
  const mergedScenes = current.scenes.map((scene, i) => {
    if (i !== sceneIndex) return scene;
    return { ...scene, text: sug.text, imagery: sug.imagery };
  });
  return { ...current, scenes: mergedScenes };
}

/** Apply one field from the suggestion for a single scene; keep everything else from current chunks. */
export function mergeOneSuggestionField(
  current: ChunksOutput,
  sceneSuggestions: ChunksOutput,
  sceneIndex: number,
  field: "text" | "imagery",
): ChunksOutput {
  const sug = sceneSuggestions.scenes[sceneIndex];
  if (!sug) return current;
  const mergedScenes = current.scenes.map((scene, i) => {
    if (i !== sceneIndex) return scene;
    return { ...scene, [field]: sug[field] };
  });
  return { ...current, scenes: mergedScenes };
}
