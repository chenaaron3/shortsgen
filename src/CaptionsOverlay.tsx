import React from "react";
import { useCurrentFrame } from "remotion";
import { AbsoluteFill, interpolate } from "remotion";
import type { Caption } from "./types";
import {
  createTikTokStyleCaptions,
  type TikTokPage,
} from "@remotion/captions";

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

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: "#FFE135",
          padding: "8px 20px",
          maxWidth: width * 0.9,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: Math.min(width * 0.07, 32),
          fontWeight: 800,
          textAlign: "center",
          whiteSpace: "pre-wrap" as const,
          opacity,
          transform: `rotate(-2deg) scale(${scale})`,
          textShadow: [
            "3px 3px 0 #000",
            "-3px -3px 0 #000",
            "3px -3px 0 #000",
            "-3px 3px 0 #000",
            "0 3px 0 #000",
            "0 -3px 0 #000",
            "3px 0 0 #000",
            "-3px 0 0 #000",
          ].join(", "),
        }}
      >
        {currentPage.text.trim()}
      </div>
    </AbsoluteFill>
  );
};
