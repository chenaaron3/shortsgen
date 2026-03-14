"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgressEventType } from "@shortgen/types";

/** Base shape for all progress events (runId, videoId, type, optional payload). */
export interface ProgressMessageBase {
  runId: string;
  videoId: string;
  type: ProgressEventType;
  payload?: unknown;
}

/** Extended types for discriminated union (payload shapes per event type). */
export type ProgressMessage =
  | (ProgressMessageBase & {
      type: "PROGRESS";
      step?: string;
      description?: string;
      progress?: number;
    })
  | (ProgressMessageBase & { type: "VIDEO_CREATED" })
  | (ProgressMessageBase & { type: "VIDEO_READY"; s3Prefix: string })
  | (ProgressMessageBase & { type: "breakdown_started" })
  | (ProgressMessageBase & { type: "breakdown_complete"; payload?: { nuggets?: unknown } })
  | (ProgressMessageBase & {
      type: "clip_complete";
      payload?: { videoId?: string; script?: string; chunks?: unknown };
    })
  | (ProgressMessageBase & { type: "initial_processing_complete"; payload?: { clips?: unknown[] } })
  | (ProgressMessageBase & { type: "feedback_applied"; payload?: { chunks?: unknown } })
  | (ProgressMessageBase & { type: "finalize_progress"; payload?: { step?: string } })
  | (ProgressMessageBase & {
      type: "finalize_complete";
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
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "error">(
    "idle"
  );
  const [lastMessage, setLastMessage] = useState<ProgressMessage | null>(null);
  const [lastError, setLastError] = useState<Event | null>(null);
  const [closeInfo, setCloseInfo] = useState<{ code: number; reason: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);

  onMessageRef.current = onMessage;

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as ProgressMessage;
    setLastMessage(msg);
    onMessageRef.current?.(msg);
  }, []);

  useEffect(() => {
    if (!enabled || !wsUrl) return;

    const connect = () => {
      setStatus("connecting");
      setLastError(null);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        reconnectCountRef.current = 0;
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        setCloseInfo({ code: ev.code, reason: ev.reason || "" });
        setStatus("closed");
        if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
          console.warn(
            "[useRunProgress] WebSocket closed",
            { code: ev.code, reason: ev.reason, clean: ev.wasClean },
            "Codes: 1000=normal, 1006=abnormal, 4xxx=API Gateway reject"
          );
        }
        if (
          reconnectCountRef.current < maxReconnectAttempts &&
          document.visibilityState === "visible"
        ) {
          reconnectCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = (e) => {
        setLastError(e);
        setStatus("error");
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as ProgressMessage;
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, wsUrl, handleMessage, maxReconnectAttempts]);

  return {
    status,
    lastMessage,
    lastError,
    closeInfo,
    connected: status === "connected",
  };
}
