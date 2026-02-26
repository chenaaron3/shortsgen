import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { createTikTokStyleCaptions } from '@remotion/captions';

import type { TikTokPage } from '@remotion/captions';

import type { Caption } from "./types";
type CaptionsOverlayProps = {
  captions: Caption[];
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
};

function formatCaption(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, "");
}

/** Word-by-word animation: each word appears as a separate caption. Use 800+ for grouped words. */
const COMBINE_TOKENS_MS = 500;

/** First ~1.5s of video: stronger caption bump for stop-scrolling hook */
const FIRST_WORDS_BOOST_MS = 1500;

const SENTENCE_END_PUNCTUATION = /[.!?,;]$/;

/** Split captions into sentence groups. A sentence boundary is when the previous caption ends with . ! or ? */
function splitCaptionsBySentence(captions: Caption[]): Caption[][] {
  if (captions.length === 0) return [];
  const groups: Caption[][] = [];
  let current: Caption[] = [];
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    const prev = i > 0 ? captions[i - 1] : null;
    if (prev && current.length > 0 && SENTENCE_END_PUNCTUATION.test(prev.text.trim())) {
      groups.push(current);
      current = [];
    }
    current.push(c);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Token with merged display bounds—spans group segment, no overlap with other tokens. */
type TokenWithDisplaySpan = { text: string; fromMs: number; toMs: number; displayStartMs: number; displayEndMs: number };

/** Page with extended display bounds for merged interval coverage (no gaps). */
type PageWithDisplayEnd = Omit<TikTokPage, "tokens"> & {
  displayEndMs: number;
  tokens: TokenWithDisplaySpan[];
};

/** Partition group interval into non-overlapping word segments. Words span start=>end of group. */
function partitionTokenIntervals(tokens: TikTokPage["tokens"]): TokenWithDisplaySpan[] {
  if (tokens.length === 0) return [];
  const groupStart = tokens[0].fromMs;
  const groupEnd = tokens[tokens.length - 1].toMs;
  let groupSpan = Math.max(0, groupEnd - groupStart);
  const totalDuration = tokens.reduce((s, t) => s + (t.toMs - t.fromMs), 0);
  if (groupSpan <= 0) groupSpan = totalDuration > 0 ? totalDuration : 1;
  if (totalDuration <= 0) {
    const equalSpan = groupSpan / tokens.length;
    return tokens.map((t, i) => ({
      ...t,
      displayStartMs: groupStart + i * equalSpan,
      displayEndMs: groupStart + (i + 1) * equalSpan,
    }));
  }
  let cumulative = 0;
  return tokens.map((t) => {
    const segDuration = ((t.toMs - t.fromMs) / totalDuration) * groupSpan;
    const displayStartMs = groupStart + cumulative;
    cumulative += segDuration;
    const displayEndMs = groupStart + cumulative;
    return { ...t, displayStartMs, displayEndMs };
  });
}

/** Merge page intervals so display windows abut—no gaps from first word to last. */
function mergePageIntervals(
  pages: TikTokPage[],
  videoDurationMs: number
): PageWithDisplayEnd[] {
  if (pages.length === 0) return [];
  const sorted = [...pages].sort((a, b) => a.startMs - b.startMs);
  return sorted.map((p, i) => {
    const nativeEnd = p.startMs + p.durationMs;
    const displayEndMs =
      i + 1 < sorted.length
        ? sorted[i + 1].startMs
        : Math.max(nativeEnd, videoDurationMs);
    const tokens = partitionTokenIntervals(p.tokens);
    return { ...p, displayEndMs, tokens };
  });
}

export const CaptionsOverlay: React.FC<CaptionsOverlayProps> = ({
  captions,
  fps,
  width,
  height,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;
  const videoDurationMs = (durationInFrames / fps) * 1000;

  const pagesWithDisplayEnd = useMemo(() => {
    const sentenceGroups = splitCaptionsBySentence(captions);
    const allPages: TikTokPage[] = [];
    for (const group of sentenceGroups) {
      const { pages: groupPages } = createTikTokStyleCaptions({
        captions: group,
        combineTokensWithinMilliseconds: COMBINE_TOKENS_MS,
      });
      allPages.push(...groupPages);
    }
    return mergePageIntervals(allPages, videoDurationMs);
  }, [captions, videoDurationMs]);

  const currentPage = pagesWithDisplayEnd.find(
    (p) => timeMs >= p.startMs && timeMs < p.displayEndMs
  );

  if (!currentPage) return null;

  const isFirstPage = pagesWithDisplayEnd[0] === currentPage;
  const nativeEnd = currentPage.startMs + currentPage.durationMs;
  const isInHoldRegion = timeMs >= nativeEnd;
  const displaySpan = currentPage.displayEndMs - currentPage.startMs;
  // Use display window for opacity so we don't fade out during hold—only fade when actually transitioning
  const displayProgress =
    displaySpan > 0
      ? (timeMs - currentPage.startMs) / displaySpan
      : 0.5;

  const opacity = interpolate(
    displayProgress,
    [0, 0.15, 0.85, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ width: "100%", zIndex: 100 }}>
      <div
        style={{
          position: "relative",
          left: "50%",
          top: "72%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          padding: "16px 40px",
          maxWidth: width * 0.82,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: Math.min(width * 0.09, 44),
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
          const isLastToken = i === currentPage.tokens.length - 1;
          const isActive =
            timeMs >= token.displayStartMs && timeMs < token.displayEndMs
              ? true
              : isInHoldRegion && isLastToken
                ? true
                : false;
          const wordDuration = token.displayEndMs - token.displayStartMs;
          const wordProgress =
            wordDuration > 0
              ? (timeMs - token.displayStartMs) / wordDuration
              : 0;
          const isFirstWords =
            isFirstPage &&
            (i < 2 || token.displayStartMs < FIRST_WORDS_BOOST_MS);
          const bumpPeak = isFirstWords ? 1.25 : 1.08;
          const bump = isActive
            ? interpolate(
              wordProgress,
              [0, 0.12, 0.2, 0.8, 0.88, 1],
              [1, bumpPeak, bumpPeak, bumpPeak, bumpPeak, 1],
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
