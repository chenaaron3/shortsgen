"use client";

import { produce } from 'immer';
import { create } from 'zustand';

import { chunksSchema } from '@shortgen/types';

import type {
  ChunksOutput,
  ProgressEventType,
  WorkflowType,
} from "@shortgen/types";

import type { SceneFeedback } from "~/lib/sceneFeedback";

/** Per-video progress for sidebar. Aligns with server progress event display fields. */
export interface VideoProgress {
  workflow: WorkflowType | "export";
  type?: ProgressEventType;
  progress?: number;
  statusMessage: string;
}

export interface SceneRowUiState {
  feedback: SceneFeedback;
  assets: {
    imagePath: string | null;
    voicePath: string | null;
  };
}

export interface RunStoreUi {
  runId: string | null;
  activeVideoId: string | null;
  activeRunPhase:
    | "breakdown"
    | "scripting"
    | "asset_gen"
    | "export"
    | "failed"
    | null;
  activeVideoStatus: string | null;
  activeSourceText: string;
  scriptFeedback: string;
  activeSceneSuggestions: ChunksOutput | null;
  /** Bumped when update_imagery completes; used as cache-buster for image URLs */
  activeAssetsRefreshKey: number;
  /** True if a manual decision is pending on a script suggestion (blocks accept/discard actions). */
  suggestionDecisionPending: boolean;
  activeSceneUiByIndex: Record<number, SceneRowUiState>;
  breakdownComplete: boolean;
  sceneUpdating: number | null;
  videoUpdating: boolean;
  logsModalOpen: boolean;
}

export interface RunStoreProgress {
  videoProgressByVideo: Record<string, VideoProgress>;
}

interface ActiveVideoSelection {
  id: string;
  status: string | null;
  sourceText?: string | null;
}

interface RunStore {
  ui: RunStoreUi;
  progress: RunStoreProgress;
  setRunId: (runId: string) => void;
  setActiveVideo: (video: ActiveVideoSelection | null) => void;
  setActiveRunPhase: (
    phase: "breakdown" | "scripting" | "asset_gen" | "export" | "failed",
  ) => void;
  setActiveVideoStatus: (status: string | null) => void;
  setActiveSourceText: (text: string) => void;
  setScriptFeedback: (s: string) => void;
  /** Set from suggestion_partial (parsed string) or suggestion_completed (chunks object). */
  setSceneSuggestions: (data: string | ChunksOutput) => void;
  clearSceneSuggestions: () => void;
  clearSceneSuggestionAt: (sceneIndex: number) => void;
  setSceneFeedback: (sceneIndex: number, feedback: SceneFeedback) => void;
  setLogsModalOpen: (open: boolean) => void;
  setBreakdownComplete: (complete: boolean) => void;
  setSceneUpdating: (index: number | null) => void;
  setVideoUpdating: (updating: boolean) => void;
  setSuggestionDecisionPending: (pending: boolean) => void;
  setVideoProgress: (videoId: string, progress: VideoProgress | null) => void;
  setAssetUploaded: (
    kind: "image" | "voice",
    sceneIndex: number,
    path: string,
  ) => void;
  bumpAssetsRefreshKey: () => void;
  init: (runId: string) => void;
  reset: () => void;
}

const initialUi: RunStoreUi = {
  runId: null,
  activeVideoId: null,
  activeRunPhase: null,
  activeVideoStatus: null,
  activeSourceText: "",
  scriptFeedback: "",
  activeSceneSuggestions: null,
  activeAssetsRefreshKey: 0,
  suggestionDecisionPending: false,
  activeSceneUiByIndex: {},
  breakdownComplete: false,
  sceneUpdating: null,
  videoUpdating: false,
  logsModalOpen: false,
};

const initialProgress: RunStoreProgress = {
  videoProgressByVideo: {},
};

function defaultSceneRowUiState(): SceneRowUiState {
  return {
    feedback: { sentiment: null, note: "" },
    assets: { imagePath: null, voicePath: null },
  };
}

function ensureSceneUi(draft: RunStoreUi, sceneIndex: number): SceneRowUiState {
  if (!draft.activeSceneUiByIndex[sceneIndex]) {
    draft.activeSceneUiByIndex[sceneIndex] = defaultSceneRowUiState();
  }
  return draft.activeSceneUiByIndex[sceneIndex]!;
}

export const useRunStore = create<RunStore>((set) => ({
  ui: initialUi,
  progress: initialProgress,

  setRunId: (runId) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.runId = runId;
      }),
    ),
  setActiveVideo: (video) =>
    set((s) =>
      produce(s, (draft) => {
        const nextVideoId = video?.id ?? null;
        const videoChanged = draft.ui.activeVideoId !== nextVideoId;
        draft.ui.activeVideoId = nextVideoId;
        draft.ui.activeVideoStatus = video?.status ?? null;
        draft.ui.activeSourceText = video?.sourceText ?? "";

        if (!videoChanged) return;

        draft.ui.scriptFeedback = "";
        draft.ui.activeSceneSuggestions = null;
        draft.ui.activeAssetsRefreshKey = 0;
        draft.ui.suggestionDecisionPending = false;
        draft.ui.activeSceneUiByIndex = {};
        draft.ui.sceneUpdating = null;
        draft.ui.videoUpdating = false;
      }),
    ),
  setActiveRunPhase: (phase) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.activeRunPhase = phase;
      }),
    ),
  setActiveVideoStatus: (status) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.activeVideoStatus = status;
      }),
    ),
  setActiveSourceText: (text) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.activeSourceText = text;
      }),
    ),
  setScriptFeedback: (val) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.scriptFeedback = val;
      }),
    ),
  setSceneFeedback: (sceneIndex, feedback) =>
    set((s) =>
      produce(s, (draft) => {
        const ui = ensureSceneUi(draft.ui, sceneIndex);
        ui.feedback = feedback;
      }),
    ),
  setLogsModalOpen: (open) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.logsModalOpen = open;
      }),
    ),
  setBreakdownComplete: (complete) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.breakdownComplete = complete;
      }),
    ),
  setSceneUpdating: (index) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.sceneUpdating = index;
      }),
    ),
  setSceneSuggestions: (data) =>
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
          draft.ui.activeSceneSuggestions = result.data;
        }
      }),
    ),
  clearSceneSuggestions: () =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.activeSceneSuggestions = null;
      }),
    ),
  clearSceneSuggestionAt: (sceneIndex) =>
    set((s) =>
      produce(s, (draft) => {
        const current = draft.ui.activeSceneSuggestions;
        if (!current?.scenes?.length) return;
        const nextScenes = current.scenes.map((scene, idx) =>
          idx === sceneIndex ? undefined : scene,
        );
        const hasRemaining = nextScenes.some((x) => !!x);
        draft.ui.activeSceneSuggestions = hasRemaining
          ? ({ ...current, scenes: nextScenes } as ChunksOutput)
          : null;
      }),
    ),
  setVideoUpdating: (updating) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.videoUpdating = updating;
      }),
    ),
  setSuggestionDecisionPending: (pending) =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.suggestionDecisionPending = pending;
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
  setAssetUploaded: (kind, sceneIndex, path) =>
    set((s) =>
      produce(s, (draft) => {
        const ui = ensureSceneUi(draft.ui, sceneIndex);
        if (kind === "image") {
          ui.assets.imagePath = path;
        } else {
          ui.assets.voicePath = path;
        }
      }),
    ),
  bumpAssetsRefreshKey: () =>
    set((s) =>
      produce(s, (draft) => {
        draft.ui.activeAssetsRefreshKey += 1;
      }),
    ),

  init: (runId) =>
    set({
      ui: { ...initialUi, runId },
      progress: initialProgress,
    }),

  reset: () =>
    set({
      ui: initialUi,
      progress: initialProgress,
    }),
}));
