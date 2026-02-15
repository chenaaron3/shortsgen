import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { createTikTokStyleCaptions } from '@remotion/captions';

import type { TikTokPage } from '@remotion/captions';

import type { Caption } from "./types";
type CaptionsOverlayProps = {
  captions: Caption[];
  fps: number;
  width: number;
  height: number;
};

/** Word-by-word animation: each word appears as a separate caption. Use 800+ for grouped words. */
const COMBINE_TOKENS_MS = 0;

export const CaptionsOverlay: React.FC<CaptionsOverlayProps> = ({
  captions,
  fps,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: COMBINE_TOKENS_MS,
  });

  const currentPage = pages.find(
    (p: TikTokPage) => timeMs >= p.startMs && timeMs < p.startMs + p.durationMs
  );

  if (!currentPage) return null;

  const pageProgress =
    (timeMs - currentPage.startMs) / currentPage.durationMs;

  // Snappy in/out: quick pop in at start, quick pop out at end
  const opacity = interpolate(
    pageProgress,
    [0, 0.08, 0.92, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Bounce: small → large overshoot → settle at normal
  const scale = interpolate(
    pageProgress,
    [0, 0.12, 0.3, 0.85, 1],
    [0.7, 1.3, 1, 1, 0.85],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Deterministic "random" rotation per caption (stable across frames, -2 to 2 deg)
  const rotation =
    ((currentPage.startMs * 7919 +
      [...currentPage.text].reduce((a, c) => a + c.charCodeAt(0), 0)) %
      5) -
    2;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: height * 0.25,
      }}
    >
      <div
        style={{
          color: "#FFE135",
          padding: "12px 24px",
          maxWidth: width * 0.9,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: Math.min(width * 0.11, 52),
          fontWeight: 800,
          textAlign: "center",
          whiteSpace: "pre-wrap" as const,
          opacity,
          transform: `rotate(${rotation}deg) scale(${scale})`,
          backgroundColor: "rgba(0, 0, 0, 0.35)",
          borderRadius: 8,
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
          textShadow: [
            "2px 2px 0 #000",
            "-2px -2px 0 #000",
            "2px -2px 0 #000",
            "-2px 2px 0 #000",
            "0 2px 0 #000",
            "0 -2px 0 #000",
            "2px 0 0 #000",
            "-2px 0 0 #000",
          ].join(", "),
        }}
      >
        {currentPage.text.trim()}
      </div>
    </AbsoluteFill>
  );
};
