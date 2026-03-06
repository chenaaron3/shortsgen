export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};

export type SceneInput = {
  text: string;
  imagePath: string;
  voicePath: string;
  durationInSeconds: number;
  /** Image dimensions; when height > width (tall), scene uses full-bleed layout */
  imageWidth?: number;
  imageHeight?: number;
};

export type VideoManifest = {
  cacheKey: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  scenes: SceneInput[];
  captions: Caption[];
};
