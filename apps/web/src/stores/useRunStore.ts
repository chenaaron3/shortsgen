"use client";

import { produce } from "immer";
import { create } from "zustand";

import { chunksSchema } from "@shortgen/types";

import type { ChunksOutput, ProgressEventType, WorkflowType } from "@shortgen/types";

import type { SceneFeedback } from "~/lib/sceneFeedback";

/** Per-video progress for sidebar. Aligns with server progress event display fields. */
export interface VideoProgress {
  workflow: WorkflowType | "export";
  type?: ProgressEventType;
  progress?: number;
  statusMessage: string;
}

export interface RunStoreUi {
  runId: string | null;
  sourceTextByVideo: Record<string, string>;
  logsModalOpen: boolean;
}

export interface RunStoreFeedback {
  scriptFeedback: string;
  feedbackByVideo: Record<
    string,
    { sceneFeedback?: Record<number, SceneFeedback> }
  >;
}

/** Maps video ID → ChunksOutput (LLM scene suggestions: streaming partial or final). From suggestion_partial / suggestion_completed WS events. */
export type SceneSuggestionsByVideo = { [videoId: string]: ChunksOutput };

/** Per-video progressive assets from WebSocket (image_uploaded, voice_uploaded). Used before manifest exists. */
export interface VideoAssets {
  assetBaseUrl: string;
  imageByIndex: Record<number, string>;
  voiceByIndex: Record<number, string>;
}

export interface RunStoreProgress {
  breakdownComplete: boolean;
  sceneUpdating: number | null;
  videoUpdating: boolean;
  sceneSuggestionsByVideo: SceneSuggestionsByVideo;
  videoProgressByVideo: Record<string, VideoProgress>;
  assetsByVideo: Record<string, VideoAssets>;
  /** Bumped when update_imagery completes; used as cache-buster for image URLs */
  assetsRefreshKeyByVideo: Record<string, number>;
}

interface RunStore {
  ui: RunStoreUi;
  feedback: RunStoreFeedback;
  progress: RunStoreProgress;
  setScriptFeedback: (s: string) => void;
  /** Set from suggestion_partial (parsed string) or suggestion_completed (chunks object). */
  setSceneSuggestions: (videoId: string, data: string | ChunksOutput) => void;
  clearSceneSuggestions: (videoId: string) => void;
  setSceneFeedback: (
    videoId: string,
    sceneIndex: number,
    feedback: SceneFeedback,
  ) => void;
  setLogsModalOpen: (open: boolean) => void;
  setSourceText: (videoId: string, text: string) => void;
  setBreakdownComplete: (complete: boolean) => void;
  setSceneUpdating: (index: number | null) => void;
  setVideoUpdating: (updating: boolean) => void;
  setVideoProgress: (videoId: string, progress: VideoProgress | null) => void;
  setAssetsBaseUrl: (videoId: string, assetBaseUrl: string) => void;
  setAssetUploaded: (
    videoId: string,
    kind: "image" | "voice",
    sceneIndex: number,
    path: string,
  ) => void;
  bumpAssetsRefreshKey: (videoId: string) => void;
  init: (runId: string) => void;
  reset: () => void;
}

const initialUi: RunStoreUi = {
  runId: null,
  sourceTextByVideo: {},
  logsModalOpen: false,
};

const initialFeedback: RunStoreFeedback = {
  scriptFeedback: "",
  feedbackByVideo: {},
};

const initialProgress: RunStoreProgress = {
  breakdownComplete: false,
  sceneUpdating: null,
  videoUpdating: false,
  sceneSuggestionsByVideo: {},
  videoProgressByVideo: {},
  assetsByVideo: {},
  assetsRefreshKeyByVideo: {},
};

export const useRunStore = create<RunStore>((set) => ({
  ui: initialUi,
  feedback: initialFeedback,
  progress: initialProgress,

  setScriptFeedback: (val) =>
    set((s) =>
      produce(s, (draft) => {
        draft.feedback.scriptFeedback = val;
      }),
    ),
  setSceneFeedback: (videoId, sceneIndex, feedback) =>
    set((s) =>
      produce(s, (draft) => {
        const byVideo = draft.feedback.feedbackByVideo;
        if (!byVideo[videoId]) byVideo[videoId] = {};
        if (!byVideo[videoId].sceneFeedback)
          byVideo[videoId].sceneFeedback = {};
        byVideo[videoId].sceneFeedback![sceneIndex] = feedback;
      }),
    ),
  setLogsModalOpen: (open) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.logsModalOpen = open;
      }),
    ),
  setSourceText: (videoId, text) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.sourceTextByVideo[videoId] = text;
      }),
    ),
  setBreakdownComplete: (complete) =>
    set((s) =>
      produce(s, (draft) => {
        draft.progress.breakdownComplete = complete;
      }),
    ),
  setSceneUpdating: (index) =>
    set((s) =>
      produce(s, (draft) => {
        draft.progress.sceneUpdating = index;
      }),
    ),
  setSceneSuggestions: (videoId, data) =>
    set((s) =>
      produce(s, (draft) => {
        const raw =
          typeof data === "string"
            ? (() => {
                try {
                  return JSON.parse(data) as unknown;
                } catch {
                  return null;
                }
              })()
            : data;
        const result = raw
          ? chunksSchema.safeParse(raw)
          : { success: false as const, data: null };
        if (result.success) {
          draft.progress.sceneSuggestionsByVideo[videoId] = result.data;
        }
      }),
    ),
  clearSceneSuggestions: (videoId) =>
    set((s) =>
      produce(s, (draft) => {
        delete draft.progress.sceneSuggestionsByVideo[videoId];
      }),
    ),
  setVideoUpdating: (updating) =>
    set((s) =>
      produce(s, (draft) => {
        draft.progress.videoUpdating = updating;
      }),
    ),
  setVideoProgress: (videoId, progress) =>
    set((s) =>
      produce(s, (draft) => {
        if (progress === null) {
          delete draft.progress.videoProgressByVideo[videoId];
        } else {
          draft.progress.videoProgressByVideo[videoId] = progress;
        }
      }),
    ),
  setAssetsBaseUrl: (videoId, assetBaseUrl) =>
    set((s) =>
      produce(s, (draft) => {
        if (!draft.progress.assetsByVideo[videoId]) {
          draft.progress.assetsByVideo[videoId] = {
            assetBaseUrl,
            imageByIndex: {},
            voiceByIndex: {},
          };
        } else {
          draft.progress.assetsByVideo[videoId]!.assetBaseUrl = assetBaseUrl;
        }
      }),
    ),
  setAssetUploaded: (videoId, kind, sceneIndex, path) =>
    set((s) =>
      produce(s, (draft) => {
        const entry = draft.progress.assetsByVideo[videoId];
        if (!entry) return;
        if (kind === "image") {
          entry.imageByIndex[sceneIndex] = path;
        } else {
          entry.voiceByIndex[sceneIndex] = path;
        }
      }),
    ),
  bumpAssetsRefreshKey: (videoId) =>
    set((s) =>
      produce(s, (draft) => {
        const key = draft.progress.assetsRefreshKeyByVideo[videoId] ?? 0;
        draft.progress.assetsRefreshKeyByVideo[videoId] = key + 1;
      }),
    ),

  init: (runId) =>
    set({
      ui: { ...initialUi, runId },
      feedback: initialFeedback,
      progress: {
        ...initialProgress,
        assetsByVideo: {},
        assetsRefreshKeyByVideo: {},
      },
    }),

  reset: () =>
    set({
      ui: initialUi,
      feedback: initialFeedback,
      progress: {
        ...initialProgress,
        assetsByVideo: {},
        assetsRefreshKeyByVideo: {},
      },
    }),
}));
