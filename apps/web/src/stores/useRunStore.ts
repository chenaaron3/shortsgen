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

export interface RunStoreProgress {
  breakdownComplete: boolean;
  sceneUpdating: number | null;
  videoUpdating: boolean;
  sceneSuggestionsByVideo: SceneSuggestionsByVideo;
  videoProgressByVideo: Record<string, VideoProgress>;
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

  init: (runId) =>
    set({
      ui: { ...initialUi, runId },
      feedback: initialFeedback,
      progress: initialProgress,
    }),

  reset: () =>
    set({
      ui: initialUi,
      feedback: initialFeedback,
      progress: initialProgress,
    }),
}));
