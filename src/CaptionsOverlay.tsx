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

function formatCaption(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, "");
}

/** Word-by-word animation: each word appears as a separate caption. Use 800+ for grouped words. */
const COMBINE_TOKENS_MS = 800;

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

  // Appear immediately, fade out at end
  const opacity = interpolate(
    pageProgress,
    [0, 0.01, 0.92, 1],
    [1, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: height * 0.15,
        zIndex: 100,
      }}
    >
      <div
        style={{
          padding: "12px 24px",
          maxWidth: width * 0.9,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: Math.min(width * 0.11, 52),
          fontWeight: 800,
          textAlign: "center",
          whiteSpace: "pre-wrap" as const,
          wordSpacing: "0.1em",
          opacity,
          textShadow: [
            "0 0 4px rgba(0,0,0,0.9)",
            "0 0 8px rgba(0,0,0,0.7)",
            "0 4px 8px rgba(0,0,0,0.6)",
            "4px 4px 0 #000",
            "-4px -4px 0 #000",
            "4px -4px 0 #000",
            "-4px 4px 0 #000",
            "0 4px 0 #000",
            "0 -4px 0 #000",
            "4px 0 0 #000",
            "-4px 0 0 #000",
          ].join(", "),
        }}
      >
        {currentPage.tokens.map((token, i) => {
          const isActive = timeMs >= token.fromMs && timeMs < token.toMs;
          const wordDuration = token.toMs - token.fromMs;
          const wordProgress =
            wordDuration > 0
              ? (timeMs - token.fromMs) / wordDuration
              : 0;
          const bump = isActive
            ? interpolate(
              wordProgress,
              [0, 0.12, 0.2, 0.8, 0.88, 1],
              [1, 1.08, 1.08, 1.08, 1.08, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
            : 1;
          return (
            <span
              key={i}
              style={{
                color: isActive ? "#FFE135" : "#FFFFFF",
                display: "inline-block",
                transform: `scale(${bump})`,
              }}
            >
              {formatCaption(token.text)}
              {i < currentPage.tokens.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
