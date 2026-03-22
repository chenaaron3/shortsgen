"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "~/env";
import { useRunStore } from "~/stores/useRunStore";

import type { ChunksOutput, ProgressEventType, WorkflowType } from "@shortgen/types";
/** Base shape for all progress events (runId, videoId, type, workflow, optional progress, payload). */
export interface ProgressMessageBase {
  runId: string;
  videoId: string;
  type: ProgressEventType;
  workflow?: WorkflowType;
  /** Server-estimated progress 0–1. Generic across events. */
  progress?: number;
  payload?: unknown;
}

/** Extended types for discriminated union (payload shapes per event type). */
export type ProgressMessage =
  | (ProgressMessageBase & { type: "breakdown_started" })
  | (ProgressMessageBase & {
      type: "breakdown_completed";
      payload?: { nuggets?: unknown };
    })
  | (ProgressMessageBase & {
      type: "video_started";
      payload?: { videoId?: string; sourceText?: string };
    })
  | (ProgressMessageBase & {
      type: "script_created";
      payload?: { videoId?: string; script?: string };
    })
  | (ProgressMessageBase & {
      type: "video_completed";
      payload?: { videoId?: string; script?: string; chunks?: unknown };
    })
  | (ProgressMessageBase & {
      type: "initial_processing_complete";
      payload?: { clips?: unknown[] };
    })
  | (ProgressMessageBase & { type: "suggestion_started" })
  | (ProgressMessageBase & {
      type: "suggestion_partial";
      payload?: { partial?: string };
    })
  | (ProgressMessageBase & {
      type: "suggestion_completed";
      payload?: { chunks?: unknown };
    })
  | (ProgressMessageBase & {
      type: "asset_gen_started";
      payload?: { step?: string; totalScenes?: number };
    })
  | (ProgressMessageBase & {
      type: "image_generated";
      payload?: { sceneIndex?: number };
    })
  | (ProgressMessageBase & {
      type: "voice_generated";
      payload?: { sceneIndex?: number };
    })
  | (ProgressMessageBase & {
      type: "caption_generated";
      payload?: unknown;
    })
  | (ProgressMessageBase & {
      type: "asset_gen_completed";
      payload?: { videoId?: string; s3Prefix?: string };
    })
  | (ProgressMessageBase & {
      type: "error";
      runId?: string;
      videoId?: string;
      payload?: { error?: string };
      message?: string;
    });

export interface UseRunProgressOptions {
  wsUrl: string;
  onMessage?: (msg: ProgressMessage) => void;
  enabled?: boolean;
  /** Max reconnect attempts. Default 3. */
  maxReconnectAttempts?: number;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

export function useRunProgress({
  wsUrl,
  onMessage,
  enabled = true,
  maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
}: UseRunProgressOptions) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "closed" | "error"
  >("idle");
  const [lastMessage, setLastMessage] = useState<ProgressMessage | null>(null);
  const [lastError, setLastError] = useState<Event | null>(null);
  const [closeInfo, setCloseInfo] = useState<{
    code: number;
    reason: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onMessageRef = useRef(onMessage);
  const activeRef = useRef(true);

  onMessageRef.current = onMessage;

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as ProgressMessage;
    setLastMessage(msg);
    onMessageRef.current?.(msg);
  }, []);

  useEffect(() => {
    if (!enabled || !wsUrl) return;

    activeRef.current = true;

    const connect = () => {
      setStatus("connecting");
      setLastError(null);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (
          typeof window !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          console.log("[useRunProgress] WebSocket connected");
        }
        setStatus("connected");
        reconnectCountRef.current = 0;
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        setCloseInfo({ code: ev.code, reason: ev.reason || "" });
        setStatus("closed");
        if (
          typeof window !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          console.warn(
            "[useRunProgress] WebSocket closed",
            { code: ev.code, reason: ev.reason, clean: ev.wasClean },
            "Codes: 1000=normal, 1006=abnormal, 4xxx=API Gateway reject",
          );
        }
        // Only reconnect if we're still mounted and this wasn't an intentional close
        if (
          activeRef.current &&
          reconnectCountRef.current < maxReconnectAttempts &&
          document.visibilityState === "visible"
        ) {
          reconnectCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = (e) => {
        if (
          typeof window !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          console.log("[useRunProgress] WebSocket error", e);
        }
        setLastError(e);
        setStatus("error");
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as ProgressMessage;
          if (
            typeof window !== "undefined" &&
            process.env.NODE_ENV === "development"
          ) {
            console.log("[useRunProgress] WebSocket message:", data);
          }
          handleMessage(data);
        } catch {
          handleMessage({
            type: "error",
            runId: "",
            videoId: "",
            message: "Invalid message",
          });
        }
      };
    };

    connect();

    return () => {
      activeRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, wsUrl, maxReconnectAttempts]);

  return {
    status,
    lastMessage,
    lastError,
    closeInfo,
    connected: status === "connected",
  };
}

function buildWsUrl(runId: string): string {
  const wsBaseUrl = env.NEXT_PUBLIC_SHORTGEN_WS_URL;
  if (!wsBaseUrl) return "";
  try {
    const u = new URL(wsBaseUrl);
    if (!u.pathname || u.pathname === "/") u.pathname = "/$default";
    return `${u.toString()}?runId=${runId}`;
  } catch {
    return `${wsBaseUrl}?runId=${runId}`;
  }
}

/** Handler that updates zustand + optionally refetches. Used by useRunProgressWithHandler. */
function createProgressHandler(refetch: (() => void) | undefined) {
  return (msg: ProgressMessage) => {
    const {
      setBreakdownComplete,
      setSourceText,
      setSceneUpdating,
      setVideoUpdating,
      setSceneSuggestions,
      setVideoProgress,
      progress,
    } = useRunStore.getState();

    if (msg.type === "breakdown_completed") setBreakdownComplete(true);

    if (msg.type === "suggestion_partial" && msg.payload) {
      const p = msg.payload as { partial?: string };
      if (p.partial !== undefined && msg.videoId) {
        setSceneSuggestions(msg.videoId, p.partial);
      }
    }

    if (msg.type === "suggestion_completed" && msg.videoId && msg.payload) {
      const p = msg.payload as { chunks?: ChunksOutput };
      if (p.chunks) setSceneSuggestions(msg.videoId, p.chunks);
    }

    if (msg.type === "video_started" && msg.payload) {
      const p = msg.payload as { videoId?: string; sourceText?: string };
      const vid = p.videoId ?? msg.videoId;
      const text = p.sourceText ?? "";
      if (vid) {
        setSourceText(vid, text);
        refetch?.();
      }
    }

    if (
      msg.type === "initial_processing_complete" ||
      msg.type === "script_created" ||
      msg.type === "video_completed" ||
      msg.type === "suggestion_completed"
    ) {
      setSceneUpdating(null);
      refetch?.();
    }

    if (msg.type === "asset_gen_completed" && msg.payload) {
      const p = msg.payload as { videoId?: string; s3Prefix?: string };
      if (p.videoId && p.s3Prefix) {
        setVideoUpdating(false);
        refetch?.();
      }
    }

    // Update videoProgressByVideo (workflow state for sidebar)
    const vid = msg.videoId;
    const workflow = msg.workflow;
    const current = vid ? progress.videoProgressByVideo[vid] : undefined;

    const COMPLETED_EVENTS: ProgressEventType[] = [
      "video_completed",
      "suggestion_completed",
      "asset_gen_completed",
    ];
    if (vid && COMPLETED_EVENTS.includes(msg.type)) {
      setVideoProgress(vid, null);
      return;
    }

    if (!vid || !workflow) return;
    const p = msg.payload as Record<string, unknown> | undefined;
    const update: Parameters<typeof setVideoProgress>[1] = {
      workflow,
      step: msg.type,
      lastEvent: msg.type,
      ...current,
    };
    if (msg.progress !== undefined) update.progress = msg.progress;
    if (p?.totalScenes !== undefined) update.totalScenes = p.totalScenes as number;
    if (msg.type === "asset_gen_started") {
      update.totalScenes = (p?.totalScenes as number) ?? current?.totalScenes;
      update.imagesDone = 0;
      update.voiceDone = 0;
    } else if (msg.type === "image_generated") {
      update.imagesDone =
        (p?.imagesDone as number) ?? (current?.imagesDone ?? 0) + 1;
    } else if (msg.type === "voice_generated") {
      update.voiceDone =
        (p?.voiceDone as number) ?? (current?.voiceDone ?? 0) + 1;
    }
    setVideoProgress(vid, update);
  };
}

export interface UseRunProgressWithHandlerOptions {
  /** Called when run data should be refetched (e.g. after script_created, video_completed). */
  refetch?: () => void;
  enabled?: boolean;
}

/**
 * WebSocket progress hook with built-in handler for run progress events.
 * Updates zustand store and optionally refetches run data.
 * Use this on run and video pages instead of useRunProgress + manual handler.
 */
export function useRunProgressWithHandler(
  runId: string,
  options: UseRunProgressWithHandlerOptions = {},
) {
  const { refetch, enabled = true } = options;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const onMessage = useMemo(
    () => createProgressHandler(() => refetchRef.current?.()),
    [],
  );

  const wsUrl = useMemo(() => buildWsUrl(runId), [runId]);

  const result = useRunProgress({
    wsUrl,
    onMessage,
    enabled: !!wsUrl && enabled,
  });

  return result;
}
