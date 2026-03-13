"use client";

import { signIn, useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { api } from "~/utils/api";
import { useRunProgress } from "~/hooks/useRunProgress";
import { env } from "~/env";

export default function CreatePage() {
  const { data: session, status } = useSession();
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [readyVideo, setReadyVideo] = useState<{
    videoId: string;
    runId: string;
    s3Prefix: string;
  } | null>(null);
  const triggerMutation = api.runs.trigger.useMutation({
    onSuccess: (data) => {
      setRunId(data.runId);
      setWsUrl(data.wsUrl);
    },
  });

  const { status: wsStatus, lastMessage } = useRunProgress({
    wsUrl: wsUrl ?? "",
    enabled: !!wsUrl,
    onMessage: useCallback((msg) => {
      if (msg.type === "VIDEO_READY" && "videoId" in msg && "s3Prefix" in msg) {
        setReadyVideo({
          videoId: msg.videoId,
          runId: msg.runId,
          s3Prefix: msg.s3Prefix,
        });
      }
    }, []),
  });

  const handleGenerate = () => {
    if (!input.trim()) return;
    const token = crypto.randomUUID();
    tokenRef.current = token;
    const wsBase = env.NEXT_PUBLIC_SHORTGEN_WS_URL;
    if (wsBase) {
      setWsUrl(`${wsBase}?token=${token}`);
    }
    triggerMutation.mutate({ userInput: input.trim(), token });
  };

  const assetBaseUrl =
    typeof window !== "undefined" && readyVideo
      ? `${window.location.origin}/api/runs/${readyVideo.runId}/videos/${readyVideo.videoId}/`
      : "";

  const remotionServeUrl =
    env.NEXT_PUBLIC_REMOTION_SERVE_URL ??
    (typeof window !== "undefined" ? `${window.location.origin}/remotion` : undefined);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] text-white">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f0f0f] text-white">
        <p>Sign in to create videos.</p>
        <button
          onClick={() => void signIn()}
          className="rounded-full bg-white/10 px-10 py-3 font-semibold text-white no-underline transition hover:bg-white/20"
        >
          Sign in
        </button>
        <Link href="/" className="text-white/70 hover:text-white">
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Create Short | Shortgen</title>
      </Head>
      <main className="min-h-screen bg-[#0f0f0f] px-4 py-8 text-white">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="mb-6 inline-block text-white/70 hover:text-white">
            ← Back
          </Link>
          <h1 className="mb-6 text-2xl font-bold">Create Short</h1>
          <p className="mb-4 text-white/80">
            Paste your content below. The pipeline will generate a script, scenes, images, and voice.
          </p>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your article, transcript, or notes here…"
            className="mb-4 w-full resize-y rounded-lg border border-white/20 bg-white/5 px-4 py-3 font-sans text-white placeholder-white/40 focus:border-white/50 focus:outline-none"
            rows={8}
            disabled={triggerMutation.isPending}
          />

          <button
            onClick={handleGenerate}
            disabled={!input.trim() || triggerMutation.isPending}
            className="mb-8 rounded-full bg-[hsl(280,100%,70%)] px-8 py-3 font-semibold text-white transition hover:bg-[hsl(280,100%,65%)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggerMutation.isPending ? "Starting…" : "Generate"}
          </button>

          {triggerMutation.isError && (
            <p className="mb-4 text-red-400">{triggerMutation.error.message}</p>
          )}

          {wsUrl && (
            <div className="mb-8 rounded-lg border border-white/20 bg-white/5 p-4">
              <h2 className="mb-2 font-semibold">Progress</h2>
              <p className="mb-2 text-white/80">
                Status: {wsStatus === "connected" ? "Connected" : wsStatus}
              </p>
              {lastMessage && "step" in lastMessage && (
                <p className="text-sm text-white/70">
                  {lastMessage.step}: {lastMessage.description ?? ""}{" "}
                  {typeof lastMessage.progress === "number"
                    ? `(${Math.round(lastMessage.progress * 100)}%)`
                    : ""}
                </p>
              )}
            </div>
          )}

          {readyVideo && remotionServeUrl && (
            <div className="rounded-lg border border-white/20 bg-black/30 p-4">
              <h2 className="mb-4 font-semibold">Preview</h2>
              <div className="overflow-hidden rounded-lg" style={{ aspectRatio: "9/16", maxWidth: 360 }}>
                <Player
                  compositionId="ShortVideo-AssetBase"
                  inputProps={{ assetBaseUrl }}
                  durationInFrames={1}
                  fps={60}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  controls
                  style={{ width: "100%", height: "100%" }}
                  serveUrl={remotionServeUrl}
                />
              </div>
              <p className="mt-2 text-sm text-white/60">
                Run ID: {readyVideo.runId} | Video ID: {readyVideo.videoId}
              </p>
            </div>
          )}

          {readyVideo && !remotionServeUrl && (
            <div className="rounded-lg border border-white/20 bg-white/5 p-4">
              <h2 className="mb-2 font-semibold">Video ready</h2>
              <p className="text-white/80">
                Set <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_REMOTION_SERVE_URL</code>{" "}
                and run Remotion Studio (<code className="rounded bg-white/10 px-1">pnpm dev</code>{" "}
                in apps/remotion) to preview. Or open Remotion Studio and use cache key from the
                pipeline.
              </p>
              <p className="mt-2 text-sm text-white/60">
                Run: {readyVideo.runId} | Video: {readyVideo.videoId}
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
