import { chunksSchema, type ChunksOutput } from "@shortgen/types";

/** Parse raw video chunks (string or object) into typed currentChunks + scenes. */
export function parseVideoChunks(chunks: unknown): {
  currentChunks: ChunksOutput;
  scenes: ChunksOutput["scenes"];
  title?: string;
  description?: string;
} {
  if (!chunks) {
    return {
      currentChunks: { scenes: [] },
      scenes: [],
      title: undefined,
      description: undefined,
    };
  }
  const raw =
    typeof chunks === "string" ? (JSON.parse(chunks) as unknown) : chunks;
  const parsed = chunksSchema.safeParse(raw);
  if (parsed.success) {
    return {
      currentChunks: parsed.data,
      scenes: parsed.data.scenes,
      title: parsed.data.title?.trim() || undefined,
      description: parsed.data.description?.trim() || undefined,
    };
  }
  const loose = raw as {
    scenes?: ChunksOutput["scenes"];
    title?: string;
    description?: string;
  };
  const sc = loose.scenes ?? [];
  return {
    currentChunks: { scenes: sc } as ChunksOutput,
    scenes: sc,
    title: loose.title?.trim() || undefined,
    description: loose.description?.trim() || undefined,
  };
}

/** Display label for a video: title from chunks, or truncated hash. */
export function getVideoDisplayName(video: {
  id: string;
  chunks?: unknown;
}): string {
  const { title } = parseVideoChunks(video.chunks);
  return title ?? video.id.slice(0, 8);
}
