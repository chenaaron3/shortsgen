import type { ChunksOutput } from "@shortgen/types";

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
