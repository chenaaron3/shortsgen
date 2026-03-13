"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ProgressMessage =
  | { type: "PROGRESS"; step: string; description?: string; progress: number; videoId?: string }
  | { type: "VIDEO_CREATED"; videoId: string; runId: string }
  | { type: "VIDEO_READY"; videoId: string; s3Prefix: string; runId: string }
  | { type: "error"; message: string };

export interface UseRunProgressOptions {
  wsUrl: string;
  onMessage?: (msg: ProgressMessage) => void;
  enabled?: boolean;
}

export function useRunProgress({
  wsUrl,
  onMessage,
  enabled = true,
}: UseRunProgressOptions) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "error">(
    "idle"
  );
  const [lastMessage, setLastMessage] = useState<ProgressMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  onMessageRef.current = onMessage;

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as ProgressMessage;
    setLastMessage(msg);
    onMessageRef.current?.(msg);
  }, []);

  useEffect(() => {
    if (!enabled || !wsUrl) return;

    setStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => {
      setStatus("closed");
      wsRef.current = null;
    };
    ws.onerror = () => setStatus("error");
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ProgressMessage;
        handleMessage(data);
      } catch {
        handleMessage({ type: "error", message: "Invalid message" });
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, wsUrl, handleMessage]);

  return { status, lastMessage, connected: status === "connected" };
}
